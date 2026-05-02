/**
 * DarkDrive Search Module
 * Implements debounced, instant search across the virtual file system index.
 */

const Search = (function() {
    let searchTimeout = null;

    function init() {
        const searchInput = document.getElementById('global-search');
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
        });

        // Clear search when hitting escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                performSearch('');
                searchInput.blur();
            }
        });
    }

    function performSearch(query) {
        if (!query.trim()) {
            UI.refreshCurrentView();
            return;
        }

        const q = query.toLowerCase();
        const index = StorageManager.getIndex();
        
        // Filter out deleted files and files in the secret vault
        const matchedFiles = index.files.filter(f => 
            !f.deletedAt && 
            !f.isVault && 
            (f.name.toLowerCase().includes(q) || (f.type && f.type.toLowerCase().includes(q)))
        );
        
        const matchedFolders = index.folders.filter(f => 
            f.name.toLowerCase().includes(q)
        );

        // Force switch to 'files' view to display search results if on dashboard
        if (document.getElementById('view-files').classList.contains('hidden')) {
            UI.navigate('files');
            // Re-apply breadcrumb to indicate search mode
            document.getElementById('breadcrumb-list').innerHTML = `<li class="breadcrumb-item"><i class="fa-solid fa-magnifying-glass"></i> Search Results for "${query}"</li>`;
        }

        UI.renderFiles({ files: matchedFiles, folders: matchedFolders });
    }

    return {
        init,
        performSearch
    };
})();
