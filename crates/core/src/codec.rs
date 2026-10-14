//! The `.pageone` file format.
//!
//! ```text
//! offset  size  field
//! 0       6     magic  b"PG1\xF0\x9F\x8E"   (not valid text, so editors refuse it)
//! 6       1     format version (1)
//! 7       1     flags (reserved, 0)
//! 8       4     CRC-32 of the uncompressed payload, little endian
//! 12      4     uncompressed payload length, little endian
//! 16      …     raw DEFLATE stream of a MessagePack-encoded `Project`
//! ```
//!
//! MessagePack keeps the structure self-describing (old files keep opening as the
//! model grows) while DEFLATE makes the file small — a feature film is typically
//! 30–60 KB. The format is documented here because Page One is open source;
//! it is a compact binary container, not encryption.

use crate::model::Project;
use flate2::{read::DeflateDecoder, write::DeflateEncoder, Compression, Crc};
use std::io::{Read, Write};

pub const MAGIC: &[u8; 6] = b"PG1\xF0\x9F\x8E";
pub const FORMAT_VERSION: u8 = 1;
pub const EXTENSION: &str = "pageone";

#[derive(Debug)]
pub enum CodecError {
    NotPageOne,
    TooNew(u8),
    Corrupt(String),
}

impl std::fmt::Display for CodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CodecError::NotPageOne => write!(f, "This is not a Page One file."),
            CodecError::TooNew(v) => write!(
                f,
                "This file was saved by a newer version of Page One (format {v}). Please update the app."
            ),
            CodecError::Corrupt(m) => write!(f, "The file is damaged and could not be opened ({m})."),
        }
    }
}

impl std::error::Error for CodecError {}

fn crc(data: &[u8]) -> u32 {
    let mut c = Crc::new();
    c.update(data);
    c.sum()
}

pub fn encode(project: &Project) -> Vec<u8> {
    let payload = rmp_serde::to_vec_named(project).expect("project serialises");
    let mut enc = DeflateEncoder::new(Vec::with_capacity(payload.len() / 3), Compression::best());
    enc.write_all(&payload).expect("in-memory write");
    let body = enc.finish().expect("in-memory finish");

    let mut out = Vec::with_capacity(body.len() + 16);
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.push(0);
    out.extend_from_slice(&crc(&payload).to_le_bytes());
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

pub fn decode(bytes: &[u8]) -> Result<Project, CodecError> {
    if bytes.len() < 16 || &bytes[..6] != MAGIC {
        return Err(CodecError::NotPageOne);
    }
    let ver = bytes[6];
    if ver > FORMAT_VERSION {
        return Err(CodecError::TooNew(ver));
    }
    let want_crc = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
    let len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
    if len > 512 * 1024 * 1024 {
        return Err(CodecError::Corrupt("size".into()));
    }
    let mut payload = Vec::with_capacity(len);
    DeflateDecoder::new(&bytes[16..])
        .take(len as u64 + 1)
        .read_to_end(&mut payload)
        .map_err(|e| CodecError::Corrupt(e.to_string()))?;
    if payload.len() != len || crc(&payload) != want_crc {
        return Err(CodecError::Corrupt("checksum mismatch".into()));
    }
    rmp_serde::from_slice(&payload).map_err(|e| CodecError::Corrupt(e.to_string()))
}

/// Write atomically: temp file in the same folder, fsync, then rename over the target.
pub fn save_to_path(project: &Project, path: &std::path::Path) -> std::io::Result<()> {
    let bytes = encode(project);
    let dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("script")
    ));
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    // On Windows a sync client or virus scanner can hold the old file for a moment; retry briefly.
    let mut tries = 0;
    loop {
        match std::fs::rename(&tmp, path) {
            Ok(()) => return Ok(()),
            Err(e) if tries < 10 && e.kind() == std::io::ErrorKind::PermissionDenied => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return Err(e);
            }
        }
    }
}

pub fn load_from_path(path: &std::path::Path) -> Result<Project, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Could not read the file: {e}"))?;
    decode(&bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn roundtrip_and_smaller_than_json() {
        let mut p = Project::default();
        for i in 0..400 {
            p.paras
                .push(Para::new(Elem::Scene, &format!("INT. HOUSE {i} - DAY")));
            p.paras.push(Para::new(
                Elem::Action,
                "Rain hammers the window. MAYA stares at the phone.",
            ));
            p.paras.push(Para::new(Elem::Character, "MAYA"));
            p.paras.push(Para::new(
                Elem::Dialogue,
                "Pick up. Pick up, pick up, pick up.",
            ));
        }
        let bin = encode(&p);
        let json = serde_json::to_vec(&p).unwrap();
        assert!(
            bin.len() * 4 < json.len(),
            "bin {} json {}",
            bin.len(),
            json.len()
        );
        assert_eq!(decode(&bin).unwrap(), p);
        assert!(std::str::from_utf8(&bin).is_err());
    }

    #[test]
    fn rejects_garbage_and_damage() {
        assert!(matches!(
            decode(b"{\"json\":true}"),
            Err(CodecError::NotPageOne)
        ));
        let mut bin = encode(&Project::default());
        let n = bin.len();
        bin[n - 2] ^= 0xff;
        assert!(decode(&bin).is_err());
    }
}
