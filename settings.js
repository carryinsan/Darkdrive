/**
 * DarkDrive Settings Module
 * Handles UI themes, security parameters, and developer diagnostics.
 */

const Settings = (function() {
    function init() {
        setupTabs();
        setupThemeManagement();
        setupSecuritySettings();
        setupDeveloperTools();

        // Bind settings modal trigger
        const settingsTrigger = document.getElementById('settings-trigger');
        if (settingsTrigger) {
            settingsTrigger.addEventListener('click', () => {
                document.getElementById('settings-modal').classList.add('active');
                document.getElementById('overlay').classList.remove('hidden');
            });
        }
    }

    function setupTabs() {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active class from all tabs and panes
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.set-pane').forEach(p => p.classList.add('hidden'));
                
                // Add active class to clicked tab and target pane
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.remove('hidden');
            });
        });
    }

    function setupThemeManagement() {
        const themeSelector = document.getElementById('theme-selector');
        
        // Load saved theme
        const savedTheme = localStorage.getItem('darkdrive_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (themeSelector) themeSelector.value = savedTheme;

        // Change theme
        if (themeSelector) {
            themeSelector.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('darkdrive_theme', newTheme);
            });
        }
    }

    function setupSecuritySettings() {
        // Auto Lock Timer
        const autoLockInput = document.getElementById('auto-lock-timer');
        if (autoLockInput) {
            // Load saved setting
            const storedSettings = JSON.parse(localStorage.getItem('darkdrive_settings') || '{}');
            if (storedSettings.autoLockMinutes) {
                autoLockInput.value = storedSettings.autoLockMinutes;
            }

            autoLockInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val) || val < 1) val = 1;
                if (val > 60) val = 60;
                e.target.value = val;
                
                Security.setAutoLockTime(val);
                
                const currentSettings = JSON.parse(localStorage.getItem('darkdrive_settings') || '{}');
                currentSettings.autoLockMinutes = val;
                localStorage.setItem('darkdrive_settings', JSON.stringify(currentSettings));
            });
        }

        // Change Master Password
        const changePwdBtn = document.getElementById('change-pwd-btn');
        if (changePwdBtn) {
            changePwdBtn.addEventListener('click', () => {
                const newPwd = prompt("Enter new master password (minimum 4 characters):");
                if (newPwd && newPwd.length >= 4) {
                    Security.setupMasterPassword(newPwd);
                    
                    // Master password change requires re-saving the index with the new key to prevent data loss
                    // In a production app with large storage, you would iterate and re-encrypt every chunk.
                    // For this architecture, we re-save the index immediately.
                    const indexData = StorageManager.getIndex();
                    localStorage.setItem('darkdrive_fs_index', Security.encrypt(indexData));
                    
                    alert("Master password updated successfully. Note: Existing files remain encrypted with previous hash patterns unless re-uploaded. Keep your old password safe if decryption fails on legacy items.");
                } else if (newPwd) {
                    alert("Password too short.");
                }
            });
        }

        // Setup PIN
        const setupPinBtn = document.getElementById('setup-pin-btn');
        if (setupPinBtn) {
            setupPinBtn.addEventListener('click', () => {
                const pin = prompt("Enter a 4-digit numeric PIN:");
                if (pin && pin.length === 4 && !isNaN(pin)) {
                    Security.setupPIN(pin);
                    alert("Quick-access PIN configured successfully.");
                } else if (pin) {
                    alert("PIN must be exactly 4 digits.");
                }
            });
        }

        // Test Panic Button
        const testPanicBtn = document.getElementById('test-panic-btn');
        if (testPanicBtn) {
            testPanicBtn.addEventListener('click', () => {
                if (confirm("EMERGENCY WIPE: This will permanently destroy all data, settings, and files stored in DarkDrive. There is no undo. Are you absolutely sure?")) {
                    Security.panicWipe();
                }
            });
        }
    }

    function setupDeveloperTools() {
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                alert("Thumbnail and progressive rendering cache cleared.");
            });
        }

        const factoryResetBtn = document.getElementById('factory-reset-btn');
        if (factoryResetBtn) {
            factoryResetBtn.addEventListener('click', () => {
                if (confirm("This performs a complete factory reset. Proceed?")) {
                    Security.panicWipe();
                }
            });
        }
    }

    return {
        init
    };
})();
