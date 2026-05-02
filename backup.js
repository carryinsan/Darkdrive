/**
 * DarkDrive Backup & Recovery Module
 * Handles exporting all encrypted LocalStorage keys to a downloadable JSON,
 * and importing to overwrite the current state.
 */

const Backup = (function() {
    function init() {
        const exportBtn = document.getElementById('export-backup-btn');
        const importBtn = document.getElementById('import-backup-btn');
        const importInput = document.getElementById('import-backup-input');

        if (exportBtn) exportBtn.addEventListener('click', exportBackup);
        
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', handleImport);
        }
    }

    function exportBackup() {
        if (Security.isLocked()) {
            alert("Please unlock the vault first to generate a backup.");
            return;
        }

        const data = StorageManager.getAllDataExport();
        if (!data || Object.keys(data).length === 0) {
            alert("Storage is empty. Nothing to backup.");
            return;
        }
        
        try {
            const jsonString = JSON.stringify(data);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const dateStr = new Date().toISOString().split('T')[0];
            const a = document.createElement('a');
            a.href = url;
            a.download = `DarkDrive_Backup_${dateStr}.json`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Backup export failed", error);
            alert("An error occurred while generating the backup.");
        }
    }

    function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                
                // Validate if it looks like a DarkDrive backup
                const hasDarkDriveKeys = Object.keys(data).some(k => k.startsWith('darkdrive_'));
                if (!hasDarkDriveKeys) {
                    throw new Error("Invalid backup signature");
                }

                if (confirm("WARNING: Importing a backup will permanently overwrite ALL current files and folders. Proceed?")) {
                    
                    // 1. Wipe current DarkDrive state (excluding user preferences if desired, but we wipe all for clean state)
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key.startsWith('darkdrive_')) {
                            localStorage.removeItem(key);
                        }
                    }
                    
                    // 2. Inject imported data
                    for (const key in data) {
                        localStorage.setItem(key, data[key]);
                    }
                    
                    alert("Backup imported successfully. The application will now reload.");
                    location.reload();
                }
            } catch (err) {
                console.error("Import failed:", err);
                alert("Invalid backup file format. Cannot import.");
            } finally {
                // Reset input to allow importing the same file again if needed
                e.target.value = ''; 
            }
        };
        
        reader.onerror = function() {
            alert("Error reading file.");
        };

        reader.readAsText(file);
    }

    return {
        init
    };
})();
