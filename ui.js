/**
 * DarkDrive UI Controller
 * Handles DOM manipulation, view routing, rendering, drag-and-drop, and context menus.
 */

const UI = (function() {
    let currentFolder = 'root';
    let currentView = 'dashboard';
    let breadcrumbPath = [{ id: 'root', name: 'Home' }];
    let selectedFiles = new Set();
    let isListView = false;
    let chartInstance = null;

    // DOM Elements
    const views = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('.nav-item');
    const fileContainer = document.getElementById('file-container');
    const dropzone = document.getElementById('dropzone');
    const fileInputHidden = document.getElementById('file-input-hidden');
    const uploadBtnMain = document.getElementById('upload-btn-main');
    const breadcrumbList = document.getElementById('breadcrumb-list');
    const contextMenu = document.getElementById('context-menu');
    const storageFill = document.getElementById('sidebar-storage-fill');
    const storageUsedText = document.getElementById('storage-used-text');
    const storageTotalText = document.getElementById('storage-total-text');
    
    function init() {
        setupNavigation();
        setupDragAndDrop();
        setupModals();
        setupContextMenu();
        setupViewToggle();
        
        document.addEventListener('fsUpdated', () => {
            refreshCurrentView();
            updateDashboard();
        });

        // Initialize UI State
        updateDashboard();
        navigate('dashboard');
    }

    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                navItems.forEach(n => n.classList.remove('active'));
                e.currentTarget.classList.add('active');
                navigate(view);
            });
        });

        document.getElementById('lock-vault-trigger').addEventListener('click', Security.lockVault);
        
        // Handle Backwards breadcrumb navigation
        breadcrumbList.addEventListener('click', (e) => {
            const item = e.target.closest('.breadcrumb-item');
            if (!item) return;
            const folderId = item.dataset.folder;
            if (folderId) {
                // Pop path until we hit this folder
                while(breadcrumbPath.length > 0 && breadcrumbPath[breadcrumbPath.length-1].id !== folderId) {
                    breadcrumbPath.pop();
                }
                currentFolder = folderId;
                renderBreadcrumbs();
                renderFiles();
            }
        });
    }

    function navigate(view) {
        currentView = view;
        views.forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(`view-${view}`);
        if (targetView) targetView.classList.remove('hidden');

        if (view === 'files') {
            currentFolder = 'root';
            breadcrumbPath = [{ id: 'root', name: 'Home' }];
            renderBreadcrumbs();
            renderFiles();
        } else if (view === 'dashboard') {
            updateDashboard();
        } else if (view === 'secure-vault') {
            document.getElementById('vault-unlock-screen').classList.remove('hidden');
            document.getElementById('vault-content').classList.add('hidden');
            document.getElementById('vault-password').value = '';
        }
    }

    function renderBreadcrumbs() {
        breadcrumbList.innerHTML = '';
        breadcrumbPath.forEach((step, index) => {
            const li = document.createElement('li');
            li.className = 'breadcrumb-item';
            li.dataset.folder = step.id;
            li.innerHTML = index === 0 ? `<i class="fa-solid fa-home"></i> ${step.name}` : step.name;
            breadcrumbList.appendChild(li);
        });
    }

    function renderFiles(items = null) {
        fileContainer.innerHTML = '';
        fileContainer.className = isListView ? 'file-grid list-view' : 'file-grid';
        
        let foldersToRender = [];
        let filesToRender = [];

        if (items) {
            filesToRender = items.files || [];
            foldersToRender = items.folders || [];
        } else {
            foldersToRender = StorageManager.listFolders(currentFolder);
            filesToRender = StorageManager.listFiles(currentFolder);
        }

        const emptyState = document.getElementById('empty-state');
        if (foldersToRender.length === 0 && filesToRender.length === 0) {
            emptyState.classList.remove('hidden');
            dropzone.style.display = 'block';
        } else {
            emptyState.classList.add('hidden');
            dropzone.style.display = currentFolder === 'root' ? 'block' : 'none';
        }

        foldersToRender.forEach(folder => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.dataset.id = folder.id;
            el.dataset.type = 'folder';
            el.innerHTML = `
                <i class="fa-solid fa-folder file-icon folder" style="color: ${folder.color}"></i>
                <div class="file-name">${folder.name}</div>
                <div class="file-meta">${new Date(folder.created).toLocaleDateString()}</div>
            `;
            el.addEventListener('dblclick', () => openFolder(folder.id, folder.name));
            el.addEventListener('contextmenu', (e) => handleContextMenu(e, folder.id, 'folder'));
            fileContainer.appendChild(el);
        });

        filesToRender.forEach(file => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.dataset.id = file.id;
            el.dataset.type = 'file';
            
            const iconClass = getFileIcon(file.type);
            
            el.innerHTML = `
                <i class="${iconClass} file-icon"></i>
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">${StorageManager.formatBytes(file.size)}</div>
            `;
            el.addEventListener('dblclick', () => Editor.openPreview(file.id));
            el.addEventListener('contextmenu', (e) => handleContextMenu(e, file.id, 'file'));
            fileContainer.appendChild(el);
        });
    }

    function openFolder(id, name) {
        currentFolder = id;
        breadcrumbPath.push({ id, name });
        renderBreadcrumbs();
        renderFiles();
    }

    function getFileIcon(mimeType) {
        if (!mimeType) return 'fa-solid fa-file';
        if (mimeType.includes('pdf')) return 'fa-solid fa-file-pdf pdf';
        if (mimeType.includes('image')) return 'fa-solid fa-file-image image';
        if (mimeType.includes('video')) return 'fa-solid fa-file-video video';
        if (mimeType.includes('audio')) return 'fa-solid fa-file-audio audio';
        if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('javascript')) return 'fa-solid fa-file-code code';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-solid fa-file-word pdf';
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'fa-solid fa-file-zipper';
        return 'fa-solid fa-file';
    }

    // --- Upload Logic ---

    function setupDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-over'), false);
        });

        dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
        uploadBtnMain.addEventListener('click', () => fileInputHidden.click());
        dropzone.addEventListener('click', () => fileInputHidden.click());
        fileInputHidden.addEventListener('change', function() { handleFiles(this.files); });
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        
        const modal = document.getElementById('upload-modal');
        const queue = document.getElementById('upload-queue');
        modal.classList.add('active');
        document.getElementById('overlay').classList.remove('hidden');
        
        Array.from(files).forEach(file => {
            const itemEl = document.createElement('div');
            itemEl.className = 'upload-item';
            itemEl.innerHTML = `
                <div class="upload-item-header"><span>${file.name}</span> <span class="status">Reading...</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
            `;
            queue.appendChild(itemEl);

            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Data = e.target.result;
                itemEl.querySelector('.progress-fill').style.width = '50%';
                itemEl.querySelector('.status').innerText = 'Encrypting...';
                
                setTimeout(() => {
                    const result = StorageManager.saveFile({
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        parentFolder: currentFolder,
                        data: base64Data
                    });

                    itemEl.querySelector('.progress-fill').style.width = '100%';
                    itemEl.querySelector('.progress-fill').style.background = result ? 'var(--success-color)' : 'var(--danger-color)';
                    itemEl.querySelector('.status').innerText = result ? 'Done' : 'Failed (Storage Full)';
                }, 100);
            };
            // Read as Data URL to easily store and recreate blobs for preview
            reader.readAsDataURL(file); 
        });
    }

    // --- Context Menu & Modals ---

    let contextTarget = null;

    function setupContextMenu() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#context-menu')) {
                contextMenu.classList.add('hidden');
            }
        });

        document.getElementById('ctx-delete').addEventListener('click', () => {
            if (!contextTarget) return;
            if (contextTarget.type === 'file') {
                StorageManager.deleteFile(contextTarget.id);
            } else {
                StorageManager.deleteFolder(contextTarget.id);
            }
            contextMenu.classList.add('hidden');
            renderFiles();
        });

        document.getElementById('ctx-rename').addEventListener('click', () => {
            if (!contextTarget) return;
            const newName = prompt('Enter new name:', 'New Name');
            if (newName && contextTarget.type === 'file') {
                StorageManager.updateFileMeta(contextTarget.id, { name: newName });
            }
            contextMenu.classList.add('hidden');
            renderFiles();
        });

        document.getElementById('ctx-preview').addEventListener('click', () => {
            if (contextTarget && contextTarget.type === 'file') {
                Editor.openPreview(contextTarget.id);
            }
            contextMenu.classList.add('hidden');
        });
        
        document.getElementById('ctx-download').addEventListener('click', () => {
             if (contextTarget && contextTarget.type === 'file') {
                 downloadFileLocal(contextTarget.id);
             }
             contextMenu.classList.add('hidden');
        });
    }

    function handleContextMenu(e, id, type) {
        e.preventDefault();
        contextTarget = { id, type };
        
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.classList.remove('hidden');

        // Toggle visibility of specific options based on type
        document.getElementById('ctx-preview').style.display = type === 'file' ? 'flex' : 'none';
        document.getElementById('ctx-download').style.display = type === 'file' ? 'flex' : 'none';
        document.getElementById('ctx-open').style.display = type === 'folder' ? 'flex' : 'none';
    }

    function setupModals() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
                document.getElementById('overlay').classList.add('hidden');
                
                // Clear queues if closing upload modal
                if(e.target.closest('#upload-modal')) {
                    document.getElementById('upload-queue').innerHTML = '';
                }
                // Stop media if closing preview
                if(e.target.closest('#preview-modal')) {
                    document.getElementById('preview-content-area').innerHTML = '';
                }
            });
        });
    }

    function setupViewToggle() {
        document.getElementById('view-toggle-btn').addEventListener('click', () => {
            isListView = !isListView;
            document.getElementById('view-toggle-btn').innerHTML = isListView ? '<i class="fa-solid fa-grid-2"></i>' : '<i class="fa-solid fa-list"></i>';
            if (currentView === 'files') renderFiles();
        });
    }
    
    function downloadFileLocal(fileId) {
        const file = StorageManager.getFile(fileId);
        if(!file || !file.data) return alert("Error extracting file data");
        
        const a = document.createElement('a');
        a.href = file.data; // Data URL
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- Dashboard & Analytics ---

    function updateDashboard() {
        const stats = StorageManager.getStorageUsage();
        
        storageUsedText.innerText = stats.formatted;
        // Assuming ~5MB max typical localStorage
        const percentage = Math.min((stats.totalBytes / (5 * 1024 * 1024)) * 100, 100);
        storageFill.style.width = `${percentage}%`;
        
        if(percentage > 80) storageFill.style.background = 'var(--danger-color)';
        else storageFill.style.background = 'var(--accent-color)';

        document.getElementById('stat-total-files').innerText = stats.totalFiles;
        document.getElementById('stat-total-folders').innerText = stats.totalFolders;

        // Render Chart
        const ctx = document.getElementById('storage-pie-chart').getContext('2d');
        const labels = Object.keys(stats.typeStats);
        const data = Object.values(stats.typeStats);

        if (chartInstance) chartInstance.destroy();
        
        if(labels.length > 0) {
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#94a3b8' } }
                    }
                }
            });
        }
        
        // Activity Feed
        const feed = document.getElementById('activity-feed');
        feed.innerHTML = '';
        const recentFiles = StorageManager.getIndex().files
            .filter(f => !f.deletedAt)
            .sort((a,b) => b.modified - a.modified)
            .slice(0, 5);
            
        recentFiles.forEach(f => {
            const li = document.createElement('li');
            li.className = 'feed-item';
            li.innerHTML = `
                <div class="feed-icon"><i class="${getFileIcon(f.type)}"></i></div>
                <div class="feed-info">
                    <div class="feed-title">${f.name} updated</div>
                    <div class="feed-time">${new Date(f.modified).toLocaleString()}</div>
                </div>
            `;
            feed.appendChild(li);
        });
    }

    function refreshCurrentView() {
        if (currentView === 'files') renderFiles();
        if (currentView === 'dashboard') updateDashboard();
    }

    return {
        init,
        navigate,
        renderFiles,
        refreshCurrentView
    };
})();
