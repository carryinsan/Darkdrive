/**
 * DarkDrive Main Application Controller
 * Orchestrates the initialization of all sub-modules, handles the login screen flow,
 * PIN pad logic, folder creation, and secret vault authentication.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Initialize Modules ---
    Security.init();
    Settings.init();

    const appContainer = document.getElementById('app-container');
    const loginScreen = document.getElementById('login-screen');
    const masterPasswordInput = document.getElementById('master-password');
    const passwordForm = document.getElementById('password-form');
    
    // Check initialization state
    if (!Security.isInitialized()) {
        masterPasswordInput.placeholder = "Create Master Password";
        document.querySelector('#password-form .btn-primary').innerText = "Initialize Vault";
    }

    // --- Authentication Logic ---

    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pwd = masterPasswordInput.value;
        if (!pwd) return;

        if (!Security.isInitialized()) {
            if (pwd.length < 4) {
                alert("Master password must be at least 4 characters long.");
                return;
            }
            Security.setupMasterPassword(pwd);
            unlockApp();
        } else {
            if (Security.login(pwd)) {
                unlockApp();
            } else {
                masterPasswordInput.value = '';
                masterPasswordInput.classList.add('error');
                setTimeout(() => masterPasswordInput.classList.remove('error'), 500);
            }
        }
    });

    // Password Strength Indicator
    masterPasswordInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const bar = document.getElementById('pwd-strength-bar');
        if (val.length === 0) {
            bar.style.width = '0%';
        } else if (val.length < 4) {
            bar.style.width = '33%'; bar.style.background = 'var(--danger-color)';
        } else if (val.length < 8) {
            bar.style.width = '66%'; bar.style.background = '#f59e0b'; // warning
        } else {
            bar.style.width = '100%'; bar.style.background = 'var(--success-color)';
        }
    });

    function unlockApp() {
        loginScreen.classList.remove('active');
        loginScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        // Save encrypted validation token for PIN auth capability during this session if needed
        if (Security.isInitialized()) {
             localStorage.setItem('darkdrive_master_enc', Security.encrypt(masterPasswordInput.value || "session"));
        }
        
        masterPasswordInput.value = ''; // clear memory

        // Initialize core systems after unlock
        StorageManager.init();
        UI.init();
        Editor.init();
        Search.init();
        Backup.init();
    }

    // Handle session lock from Security module
    document.addEventListener('vaultLocked', () => {
        appContainer.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        loginScreen.classList.add('active');
        masterPasswordInput.value = '';
        masterPasswordInput.placeholder = "Vault Locked - Enter Password";
        document.querySelector('#password-form .btn-primary').innerText = "Unlock Vault";
    });

    // --- PIN Pad Logic ---
    let currentPin = '';
    const pinForm = document.getElementById('pin-form');
    const togglePinBtn = document.getElementById('toggle-pin-mode');
    const pinDots = document.querySelectorAll('.pin-dot');

    togglePinBtn.addEventListener('click', () => {
        const isPinHidden = pinForm.classList.contains('hidden');
        if (isPinHidden) {
            if (!localStorage.getItem('darkdrive_pin_hash')) {
                alert("No PIN configured. Setup PIN in Settings first.");
                return;
            }
            passwordForm.classList.add('hidden');
            pinForm.classList.remove('hidden');
            togglePinBtn.innerText = "Use Password";
        } else {
            pinForm.classList.add('hidden');
            passwordForm.classList.remove('hidden');
            togglePinBtn.innerText = "Use PIN";
        }
    });

    document.querySelectorAll('.num-key').forEach(key => {
        key.addEventListener('click', (e) => {
            const val = e.currentTarget.dataset.val;
            
            if (val === 'clear') {
                currentPin = currentPin.slice(0, -1);
                updatePinDisplay();
            } else if (val === 'enter') {
                if (currentPin.length === 4) {
                    if (Security.loginWithPIN(currentPin)) {
                        currentPin = '';
                        updatePinDisplay();
                        unlockApp();
                    } else {
                        currentPin = '';
                        updatePinDisplay();
                        const display = document.getElementById('pin-display');
                        display.classList.add('error');
                        setTimeout(() => display.classList.remove('error'), 500);
                    }
                }
            } else {
                if (currentPin.length < 4) {
                    currentPin += val;
                    updatePinDisplay();
                    
                    // Auto submit on 4 digits
                    if (currentPin.length === 4) {
                        setTimeout(() => {
                            document.querySelector('.num-key[data-val="enter"]').click();
                        }, 200);
                    }
                }
            }
        });
    });

    function updatePinDisplay() {
        pinDots.forEach((dot, index) => {
            if (index < currentPin.length) dot.classList.add('filled');
            else dot.classList.remove('filled');
        });
    }

    // Emergency Wipe
    document.getElementById('emergency-wipe-btn').addEventListener('click', () => {
        if (confirm("PANIC: This will destroy all encrypted data permanently. Proceed?")) {
            Security.panicWipe();
        }
    });

    // --- Folder Creation Modal Logic ---
    const newFolderModal = document.getElementById('new-folder-modal');
    const createFolderBtn = document.getElementById('create-folder-btn');
    const newFolderNameInput = document.getElementById('new-folder-name');
    let selectedFolderColor = '#3498db';

    // Show modal trigger (adding button dynamically to topbar next to upload)
    const newFolderTrigger = document.createElement('button');
    newFolderTrigger.className = 'btn-secondary';
    newFolderTrigger.innerHTML = '<i class="fa-solid fa-folder-plus"></i> New Folder';
    newFolderTrigger.style.marginRight = '10px';
    document.querySelector('.topbar-actions').insertBefore(newFolderTrigger, document.getElementById('upload-btn-main'));

    newFolderTrigger.addEventListener('click', () => {
        newFolderModal.classList.add('active');
        document.getElementById('overlay').classList.remove('hidden');
        newFolderNameInput.value = '';
        newFolderNameInput.focus();
    });

    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            e.currentTarget.classList.add('active');
            selectedFolderColor = e.currentTarget.dataset.color;
        });
    });

    createFolderBtn.addEventListener('click', () => {
        const name = newFolderNameInput.value.trim();
        if (!name) return;
        
        // We need current folder ID. UI module doesn't expose it directly, 
        // but we can pass 'root' or read breadcrumb. For robustness, we assume root unless in a folder view.
        // Quick hack to read current breadcrumb:
        const breadcrumbs = document.querySelectorAll('#breadcrumb-list li');
        const currentFolderId = breadcrumbs[breadcrumbs.length-1].dataset.folder;

        StorageManager.createFolder(name, currentFolderId, selectedFolderColor);
        
        newFolderModal.classList.remove('active');
        document.getElementById('overlay').classList.add('hidden');
    });

    // --- Secret Vault Logic ---
    const unlockVaultBtn = document.getElementById('unlock-vault-btn');
    const vaultPasswordInput = document.getElementById('vault-password');
    const vaultUploadBtn = document.getElementById('vault-upload-btn');

    unlockVaultBtn.addEventListener('click', () => {
        const pwd = vaultPasswordInput.value;
        const storedHash = localStorage.getItem('darkdrive_vault_hash');
        const salt = localStorage.getItem('darkdrive_salt');
        
        // If first time accessing vault, set it up
        if (!storedHash && pwd.length >= 4) {
            const newHash = CryptoJS.PBKDF2(pwd, salt, { keySize: 256/32, iterations: 1000 }).toString();
            localStorage.setItem('darkdrive_vault_hash', newHash);
            openVault();
        } 
        else if (storedHash) {
            const hash = CryptoJS.PBKDF2(pwd, salt, { keySize: 256/32, iterations: 1000 }).toString();
            if (hash === storedHash) {
                openVault();
            } else {
                vaultPasswordInput.value = '';
                alert('Incorrect Vault Password');
            }
        }
    });

    function openVault() {
        document.getElementById('vault-unlock-screen').classList.add('hidden');
        document.getElementById('vault-content').classList.remove('hidden');
        vaultPasswordInput.value = '';
        renderVaultFiles();
    }

    function renderVaultFiles() {
        const container = document.getElementById('vault-file-container');
        container.innerHTML = '';
        const vaultFiles = StorageManager.getIndex().files.filter(f => f.isVault && !f.deletedAt);
        
        if (vaultFiles.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Vault is empty</div>';
        } else {
            vaultFiles.forEach(file => {
                const el = document.createElement('div');
                el.className = 'file-item';
                el.innerHTML = `
                    <i class="fa-solid fa-file-shield file-icon" style="color:var(--danger-color);"></i>
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">${StorageManager.formatBytes(file.size)}</div>
                `;
                el.addEventListener('dblclick', () => Editor.openPreview(file.id));
                container.appendChild(el);
            });
        }
    }

    vaultUploadBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = e => {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = evt => {
                    StorageManager.saveFile({
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        parentFolder: 'vault_root',
                        data: evt.target.result,
                        isVault: true
                    });
                    renderVaultFiles();
                };
                reader.readAsDataURL(file);
            });
        };
        input.click();
    });

});
