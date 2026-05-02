/**
 * DarkDrive Storage Manager
 * Handles the Virtual File System, saving payloads to LocalStorage, 
 * chunking large files, and metadata indexing.
 */

const StorageManager = (function() {
    const INDEX_KEY = 'darkdrive_fs_index';
    const DATA_PREFIX = 'darkdrive_data_';
    const TRASH_PREFIX = 'darkdrive_trash_';
    
    // Chunk size limit to prevent breaking LocalStorage (max ~5MB total usually, so we chunk at 1MB)
    const CHUNK_SIZE = 1024 * 1024; 

    // In-memory index cache
    let fsIndex = {
        files: [],   // Array of file metadata
        folders: [], // Array of folder metadata
        lastUpdated: Date.now()
    };

    function init() {
        loadIndex();
    }

    function loadIndex() {
        if (Security.isLocked()) return;
        
        const rawIndex = localStorage.getItem(INDEX_KEY);
        if (rawIndex) {
            const decrypted = Security.decrypt(rawIndex);
            if (decrypted && typeof decrypted === 'object') {
                fsIndex = decrypted;
            } else {
                console.warn("Index decryption failed or invalid.");
            }
        }
    }

    function saveIndex() {
        if (Security.isLocked()) return false;
        fsIndex.lastUpdated = Date.now();
        const encryptedIndex = Security.encrypt(fsIndex);
        try {
            localStorage.setItem(INDEX_KEY, encryptedIndex);
            return true;
        } catch (e) {
            console.error("Storage quota exceeded saving index!", e);
            return false;
        }
    }

    // --- File Operations ---

    /**
     * Store a file in the virtual file system
     * @param {Object} fileData - { name, type, size, parentFolder, data (Base64), isVault }
     */
    function saveFile(fileData) {
        if (Security.isLocked()) return false;

        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const { name, type, size, parentFolder, data, isVault } = fileData;

        // Create Metadata
        const metadata = {
            id: fileId,
            name: name,
            type: type,
            size: size,
            parentFolder: parentFolder || 'root',
            created: Date.now(),
            modified: Date.now(),
            isVault: isVault || false,
            favorite: false,
            tags: [],
            chunks: 0
        };

        try {
            // Split base64 data into chunks to bypass some single-item limits and optimize parsing
            const stringData = data.toString();
            const totalChunks = Math.ceil(stringData.length / CHUNK_SIZE);
            metadata.chunks = totalChunks;

            for (let i = 0; i < totalChunks; i++) {
                const chunkData = stringData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const encryptedChunk = Security.encrypt(chunkData);
                localStorage.setItem(`${DATA_PREFIX}${fileId}_${i}`, encryptedChunk);
            }

            // Update Index
            fsIndex.files.push(metadata);
            saveIndex();
            
            // Dispatch update event
            document.dispatchEvent(new CustomEvent('fsUpdated'));
            return metadata;

        } catch (e) {
            console.error("Failed to save file. Storage might be full.", e);
            // Cleanup partial chunks
            for (let i = 0; i < metadata.chunks; i++) {
                localStorage.removeItem(`${DATA_PREFIX}${fileId}_${i}`);
            }
            return false;
        }
    }

    /**
     * Retrieve complete file data including decrypted Base64 payload
     */
    function getFile(fileId) {
        if (Security.isLocked()) return null;

        const metadata = fsIndex.files.find(f => f.id === fileId);
        if (!metadata) return null;

        let fullData = '';
        for (let i = 0; i < metadata.chunks; i++) {
            const encryptedChunk = localStorage.getItem(`${DATA_PREFIX}${fileId}_${i}`);
            if (encryptedChunk) {
                const decryptedChunk = Security.decrypt(encryptedChunk);
                if (decryptedChunk) {
                    fullData += decryptedChunk;
                } else {
                    console.error(`Chunk ${i} decryption failed for file ${fileId}`);
                    return null;
                }
            } else {
                console.error(`Missing chunk ${i} for file ${fileId}`);
                return null;
            }
        }

        return { ...metadata, data: fullData };
    }

    function deleteFile(fileId, permanent = false) {
        if (Security.isLocked()) return false;

        const fileIndex = fsIndex.files.findIndex(f => f.id === fileId);
        if (fileIndex === -1) return false;

        const fileMeta = fsIndex.files[fileIndex];

        if (!permanent && !fileMeta.isVault) {
            // Move to recycle bin (soft delete)
            fileMeta.deletedAt = Date.now();
            fileMeta.originalFolder = fileMeta.parentFolder;
            fileMeta.parentFolder = 'trash';
            saveIndex();
        } else {
            // Hard delete
            for (let i = 0; i < fileMeta.chunks; i++) {
                localStorage.removeItem(`${DATA_PREFIX}${fileId}_${i}`);
            }
            fsIndex.files.splice(fileIndex, 1);
            saveIndex();
        }
        
        document.dispatchEvent(new CustomEvent('fsUpdated'));
        return true;
    }

    function updateFileMeta(fileId, updates) {
        if (Security.isLocked()) return false;
        const file = fsIndex.files.find(f => f.id === fileId);
        if (!file) return false;

        Object.assign(file, updates);
        file.modified = Date.now();
        saveIndex();
        document.dispatchEvent(new CustomEvent('fsUpdated'));
        return true;
    }

    // --- Folder Operations ---

    function createFolder(name, parentFolder = 'root', color = '#3498db') {
        if (Security.isLocked()) return false;
        
        const folderId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const folderMeta = {
            id: folderId,
            name: name,
            parentFolder: parentFolder,
            color: color,
            created: Date.now()
        };

        fsIndex.folders.push(folderMeta);
        saveIndex();
        document.dispatchEvent(new CustomEvent('fsUpdated'));
        return folderMeta;
    }

    function deleteFolder(folderId) {
        // Find all files/folders inside
        const childrenFiles = fsIndex.files.filter(f => f.parentFolder === folderId);
        const childrenFolders = fsIndex.folders.filter(f => f.parentFolder === folderId);

        // Recursively delete
        childrenFiles.forEach(f => deleteFile(f.id, true));
        childrenFolders.forEach(f => deleteFolder(f.id));

        // Delete the folder itself
        const folderIndex = fsIndex.folders.findIndex(f => f.id === folderId);
        if (folderIndex > -1) {
            fsIndex.folders.splice(folderIndex, 1);
            saveIndex();
            document.dispatchEvent(new CustomEvent('fsUpdated'));
        }
    }

    // --- Utility Methods ---

    function listFiles(folderId = 'root', isVault = false) {
        if (Security.isLocked()) return [];
        return fsIndex.files.filter(f => f.parentFolder === folderId && !!f.isVault === isVault && !f.deletedAt);
    }

    function listFolders(parentFolder = 'root') {
        if (Security.isLocked()) return [];
        return fsIndex.folders.filter(f => f.parentFolder === parentFolder);
    }

    function getStorageUsage() {
        let total = 0;
        let fileTypes = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('darkdrive_')) {
                let bytes = (localStorage.getItem(key).length + key.length) * 2; // Rough estimate of UTF-16 bytes
                total += bytes;
            }
        }
        
        fsIndex.files.forEach(f => {
            const ext = f.name.split('.').pop().toLowerCase() || 'unknown';
            if(!fileTypes[ext]) fileTypes[ext] = 0;
            fileTypes[ext] += f.size || 0;
        });

        return { 
            totalBytes: total, 
            formatted: formatBytes(total),
            totalFiles: fsIndex.files.filter(f => !f.deletedAt).length,
            totalFolders: fsIndex.folders.length,
            typeStats: fileTypes
        };
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    function getAllDataExport() {
        if(Security.isLocked()) return null;
        // Generate a complete JSON dump of the LocalStorage state for backup
        let dump = {};
        for(let i=0; i<localStorage.length; i++){
            let key = localStorage.key(i);
            if(key.startsWith('darkdrive_')) {
                dump[key] = localStorage.getItem(key);
            }
        }
        return dump;
    }

    return {
        init,
        loadIndex,
        saveFile,
        getFile,
        deleteFile,
        updateFileMeta,
        createFolder,
        deleteFolder,
        listFiles,
        listFolders,
        getStorageUsage,
        formatBytes,
        getAllDataExport,
        getIndex: () => fsIndex
    };
})();
