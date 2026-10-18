/**
 * zip-builder.js - Module Vanilla JS pour la création d'archives ZIP (PKZIP standard).
 * Zéro dépendance externe. Compatible navigateur et Node.js.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ZipBuilder = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Table CRC32 précalculée
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c >>> 0;
  }

  function crc32(bytes) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function dateToDos(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { time, date: dosDate };
  }

  class ZipBuilder {
    constructor() {
      this.files = [];
    }

    /**
     * Ajoute un fichier à l'archive
     * @param {string} path Chemin dans l'archive (ex. 'cv/mon-cv.pdf')
     * @param {string|Uint8Array|ArrayBuffer|Blob} content Contenu du fichier
     */
    addFile(path, content) {
      if (!path) throw new Error('Le chemin du fichier est requis');
      // Nettoyer les slashes initiaux
      const cleanPath = String(path).replace(/^[/\\]+/, '');
      this.files.push({ path: cleanPath, content });
    }

    /**
     * Génère l'archive ZIP sous forme de Blob
     * @returns {Promise<Blob>}
     */
    async build() {
      const textEncoder = new TextEncoder();
      const localHeaders = [];
      const centralHeaders = [];
      let currentOffset = 0;

      const dosDate = dateToDos(new Date());

      for (const file of this.files) {
        let bytes;
        if (typeof file.content === 'string') {
          bytes = textEncoder.encode(file.content);
        } else if (file.content instanceof Uint8Array) {
          bytes = file.content;
        } else if (file.content instanceof ArrayBuffer) {
          bytes = new Uint8Array(file.content);
        } else if (typeof Blob !== 'undefined' && file.content instanceof Blob) {
          const ab = await file.content.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else if (file.content && file.content.buffer instanceof ArrayBuffer) {
          // Cas Buffer Node.js
          bytes = new Uint8Array(file.content.buffer, file.content.byteOffset, file.content.byteLength);
        } else {
          bytes = new Uint8Array(0);
        }

        const nameBytes = textEncoder.encode(file.path);
        const fileCrc = crc32(bytes);
        const size = bytes.length;
        const localHeaderOffset = currentOffset;

        // --- LOCAL FILE HEADER (30 octets + nom) ---
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lView = new DataView(localHeader.buffer);

        lView.setUint32(0, 0x04034b50, true); // Signature
        lView.setUint16(4, 20, true);         // Version nécessaire
        lView.setUint16(6, 0x0800, true);     // UTF-8 flag
        lView.setUint16(8, 0, true);          // Pas de compression (Store)
        lView.setUint16(10, dosDate.time, true);
        lView.setUint16(12, dosDate.date, true);
        lView.setUint32(14, fileCrc, true);
        lView.setUint32(18, size, true);       // Taille compressée
        lView.setUint32(22, size, true);       // Taille non compressée
        lView.setUint16(26, nameBytes.length, true);
        lView.setUint16(28, 0, true);          // Extra field length
        localHeader.set(nameBytes, 30);

        localHeaders.push(localHeader);
        localHeaders.push(bytes);
        currentOffset += localHeader.length + bytes.length;

        // --- CENTRAL DIRECTORY HEADER (46 octets + nom) ---
        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cView = new DataView(centralHeader.buffer);

        cView.setUint32(0, 0x02014b50, true); // Signature
        cView.setUint16(4, 20, true);         // Version made by
        cView.setUint16(6, 20, true);         // Version needed
        cView.setUint16(8, 0x0800, true);     // UTF-8 flag
        cView.setUint16(10, 0, true);         // Compression : Store
        cView.setUint16(12, dosDate.time, true);
        cView.setUint16(14, dosDate.date, true);
        cView.setUint32(16, fileCrc, true);
        cView.setUint32(20, size, true);
        cView.setUint32(24, size, true);
        cView.setUint16(28, nameBytes.length, true);
        cView.setUint16(30, 0, true);          // Extra field length
        cView.setUint16(32, 0, true);          // Comment length
        cView.setUint16(34, 0, true);          // Disk start
        cView.setUint16(36, 0, true);          // Internal attrs
        cView.setUint32(38, 0, true);          // External attrs
        cView.setUint32(42, localHeaderOffset, true);
        centralHeader.set(nameBytes, 46);

        centralHeaders.push(centralHeader);
      }

      const centralDirOffset = currentOffset;
      let centralDirSize = 0;
      for (const ch of centralHeaders) centralDirSize += ch.length;

      // --- END OF CENTRAL DIRECTORY (22 octets) ---
      const eocd = new Uint8Array(22);
      const eView = new DataView(eocd.buffer);

      eView.setUint32(0, 0x06054b50, true);
      eView.setUint16(4, 0, true);                    // Numéro de disque
      eView.setUint16(6, 0, true);                    // Disque de début du CD
      eView.setUint16(8, this.files.length, true);    // Entrées sur ce disque
      eView.setUint16(10, this.files.length, true);   // Total entrées
      eView.setUint32(12, centralDirSize, true);      // Taille CD
      eView.setUint32(16, centralDirOffset, true);    // Offset CD
      eView.setUint16(20, 0, true);                   // Comment length

      const parts = [...localHeaders, ...centralHeaders, eocd];
      return new Blob(parts, { type: 'application/zip' });
    }
  }

  return ZipBuilder;
});
