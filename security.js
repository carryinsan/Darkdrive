/**
 * DarkDrive Security Module
 * Handles AES encryption, authentication, panic wipes, and session management.
 */

const Security = (function() {
    let currentKey = null;
    let autoLockTimer = null;
    let autoLockMinutes = 5;

    // Keys for LocalStorage
    const AUTH_KEY = 'darkdrive_auth_hash';
    const PIN_KEY = 'darkdrive_pin_hash';
    const SALT_KEY = 'darkdrive_salt';
    const VAULT_AUTH_KEY = 'darkdrive_vault_hash';
    
    // Generate a random salt for hashing
    function generateSalt() {
        return CryptoJS.lib.WordArray.random(128/8).toString();
    }

    // Derive a strong key from a password and salt using PBKDF2
    function deriveKey(password, salt) {
        return CryptoJS.PBKDF2(password, salt, { keySize: 256/32, iterations: 1000 }).toString();
    }

    function init() {
        if (!localStorage.getItem(SALT_KEY)) {
            localStorage.setItem(SALT_KEY, generateSalt());
        }
        
        // Load settings if available
        const settings = JSON.parse(localStorage.getItem('darkdrive_settings') || '{}');
        if (settings.autoLockMinutes) {
            autoLockMinutes = parseInt(settings.autoLockMinutes);
        }

        setupActivityListeners();
    }

    // Checks if app is initialized with a master password
    function isInitialized() {
        return localStorage.getItem(AUTH_KEY) !== null;
    }

    // Set master password (first time setup)
    function setupMasterPassword(password) {
        const salt = localStorage.getItem(SALT_KEY);
        const hash = deriveKey(password, salt);
        localStorage.setItem(AUTH_KEY, hash);
        currentKey = hash; // Use the hash as the encryption key for the session
        startAutoLock();
        return true;
    }

    // Attempt login with master password
    function login(password) {
        const salt = localStorage.getItem(SALT_KEY);
        const hash = deriveKey(password, salt);
        const storedHash = localStorage.getItem(AUTH_KEY);

        if (hash === storedHash) {
            currentKey = hash;
            startAutoLock();
            return true;
        }
        
        // Intrusion detection log could be added here
        return false;
    }

    // Set PIN code
    function setupPIN(pin) {
        if (!currentKey) return false; // Must be logged in to set PIN
        const salt = localStorage.getItem(SALT_KEY);
        const hash = deriveKey(pin, salt);
        localStorage.setItem(PIN_KEY, hash);
        return true;
    }

    // Attempt login with PIN
    function loginWithPIN(pin) {
        const salt = localStorage.getItem(SALT_KEY);
        const hash = deriveKey(pin, salt);
        const storedHash = localStorage.getItem(PIN_KEY);

        if (storedHash && hash === storedHash) {
            // Re-derive the master key. 
            // In a truly zero-knowledge system, the PIN would unlock a keychain holding the master key.
            // For browser local storage constraints, we authenticate via PIN but require master key mapped differently,
            // but for smooth UX, we will assume PIN sets a session state if matched, relying on an active token.
            // Since LocalStorage limits true keychain architecture, we store an encrypted version of the master key.
            const encryptedMaster = localStorage.getItem('darkdrive_master_enc');
            if (encryptedMaster) {
                try {
                    const decrypted = CryptoJS.AES.decrypt(encryptedMaster, hash).toString(CryptoJS.enc.Utf8);
                    if (decrypted) {
                        currentKey = decrypted;
                        startAutoLock();
                        return true;
                    }
                } catch(e) { return false; }
            }
        }
        return false;
    }

    // Core Encryption
    function encrypt(data) {
        if (!currentKey) throw new Error("Vault is locked");
        const stringData = typeof data === 'object' ? JSON.stringify(data) : data;
        return CryptoJS.AES.encrypt(stringData, currentKey).toString();
    }

    // Core Decryption
    function decrypt(encryptedData) {
        if (!currentKey) throw new Error("Vault is locked");
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, currentKey);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            
            // Try to parse as JSON, return string if it fails
            try { return JSON.parse(decryptedString); } 
            catch(e) { return decryptedString; }
            
        } catch (error) {
            console.error("Decryption failed. Data might be corrupted or key is wrong.");
            return null;
        }
    }

    // Auto-lock Session Management
    function startAutoLock() {
        resetAutoLock();
    }

    function resetAutoLock() {
        if (autoLockTimer) clearTimeout(autoLockTimer);
        if (currentKey) {
            autoLockTimer = setTimeout(lockVault, autoLockMinutes * 60 * 1000);
        }
    }

    function lockVault() {
        currentKey = null;
        clearTimeout(autoLockTimer);
        // Trigger UI event to show login screen
        document.dispatchEvent(new CustomEvent('vaultLocked'));
    }

    function setupActivityListeners() {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(evt => {
            document.addEventListener(evt, resetAutoLock, { passive: true });
        });
    }

    // Panic Mode - Wipe Everything
    function panicWipe() {
        localStorage.clear();
        sessionStorage.clear();
        location.reload(); // Reload to reset state completely
    }

    // Export public methods
    return {
        init,
        isInitialized,
        setupMasterPassword,
        login,
        setupPIN,
        loginWithPIN,
        encrypt,
        decrypt,
        lockVault,
        panicWipe,
        isLocked: () => currentKey === null,
        setAutoLockTime: (minutes) => { autoLockMinutes = minutes; resetAutoLock(); }
    };
})();
