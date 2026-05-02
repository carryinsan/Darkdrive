/**
 * DarkDrive Editor Module
 * Handles file previews, rich text editing, code editing, and media playback inside modals.
 */

const Editor = (function() {
    let currentEditingFile = null;

    const previewModal = document.getElementById('preview-modal');
    const contentArea = document.getElementById('preview-content-area');
    const titleEl = document.getElementById('preview-title');
    const overlay = document.getElementById('overlay');
    const editorFooter = document.getElementById('editor-footer');
    const editBtn = document.getElementById('edit-file-btn');
    const saveBtn = document.getElementById('save-edit-btn');
    const downloadBtn = document.getElementById('download-preview-btn');

    function init() {
        saveBtn.addEventListener('click', saveChanges);
        downloadBtn.addEventListener('click', () => {
            if(currentEditingFile) UI.downloadFileLocal(currentEditingFile.id);
        });
    }

    function openPreview(fileId) {
        const file = StorageManager.getFile(fileId);
        if (!file) return alert("Failed to load file for preview. File may be corrupted.");

        currentEditingFile = file;
        titleEl.innerText = file.name;
        contentArea.innerHTML = '';
        editorFooter.classList.add('hidden');
        
        const mime = file.type || '';
        const dataUrl = file.data;

        // Visual Reset
        contentArea.style.background = 'rgba(0,0,0,0.5)';
        contentArea.style.overflow = 'hidden';

        // Image Preview
        if (mime.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = dataUrl;
            contentArea.appendChild(img);
            editBtn.style.display = 'none'; // Basic version no image edit
        } 
        // Video Preview
        else if (mime.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = dataUrl;
            video.controls = true;
            video.autoplay = true;
            contentArea.appendChild(video);
            editBtn.style.display = 'none';
        }
        // Audio Preview
        else if (mime.startsWith('audio/')) {
            const audioContainer = document.createElement('div');
            audioContainer.style.textAlign = 'center';
            audioContainer.style.padding = '50px';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-music';
            icon.style.fontSize = '5rem';
            icon.style.color = 'var(--accent-color)';
            icon.style.marginBottom = '20px';
            icon.style.display = 'block';
            
            const audio = document.createElement('audio');
            audio.src = dataUrl;
            audio.controls = true;
            audio.autoplay = true;
            
            audioContainer.appendChild(icon);
            audioContainer.appendChild(audio);
            contentArea.appendChild(audioContainer);
            editBtn.style.display = 'none';
        }
        // Text / Code / Markdown Preview
        else if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || mime.includes('markdown')) {
            renderTextEditor(file, false);
            editBtn.style.display = 'inline-flex';
            
            editBtn.onclick = () => {
                renderTextEditor(file, true);
                editBtn.style.display = 'none';
            };
        }
        // Fallback
        else {
            const msg = document.createElement('div');
            msg.style.textAlign = 'center';
            msg.innerHTML = `<i class="fa-solid fa-file" style="font-size:4rem; margin-bottom:20px;"></i><br>Preview not available for this file type.`;
            contentArea.appendChild(msg);
            editBtn.style.display = 'none';
        }

        previewModal.classList.add('active');
        overlay.classList.remove('hidden');
    }

    function renderTextEditor(file, isEditing) {
        contentArea.innerHTML = '';
        contentArea.style.background = 'var(--bg-secondary)';
        contentArea.style.overflow = 'auto';

        // Extract raw text from DataURL
        let rawText = '';
        try {
            // data:[<mediatype>][;base64],<data>
            const base64Data = file.data.split(',')[1];
            rawText = decodeURIComponent(escape(atob(base64Data)));
        } catch(e) {
            rawText = "Error decoding text file.";
        }

        if (isEditing) {
            const textarea = document.createElement('textarea');
            textarea.className = 'editor-textarea';
            textarea.value = rawText;
            textarea.id = 'active-editor-textarea';
            
            textarea.addEventListener('input', () => {
                const words = textarea.value.trim().split(/\s+/).filter(w=>w.length>0).length;
                document.getElementById('editor-word-count').innerText = `${words} words`;
            });
            
            contentArea.appendChild(textarea);
            editorFooter.classList.remove('hidden');
            
            // Trigger word count calc
            textarea.dispatchEvent(new Event('input'));
        } else {
            // Preview Mode
            if (file.name.endsWith('.md')) {
                const mdPreview = document.createElement('div');
                mdPreview.className = 'markdown-preview';
                mdPreview.innerHTML = marked.parse(rawText);
                contentArea.appendChild(mdPreview);
            } else {
                const pre = document.createElement('pre');
                pre.style.padding = '20px';
                pre.style.color = 'var(--text-primary)';
                pre.style.margin = '0';
                pre.style.whiteSpace = 'pre-wrap';
                pre.innerText = rawText;
                contentArea.appendChild(pre);
            }
        }
    }

    function saveChanges() {
        if (!currentEditingFile) return;
        
        const textarea = document.getElementById('active-editor-textarea');
        if (!textarea) return;

        const newText = textarea.value;
        
        // Convert back to DataURL
        const utf8Bytes = encodeURIComponent(newText).replace(/%([0-9A-F]{2})/g,
            function(match, p1) {
                return String.fromCharCode('0x' + p1);
        });
        const base64 = btoa(utf8Bytes);
        const newDataUrl = `data:${currentEditingFile.type || 'text/plain'};base64,${base64}`;

        // Delete old file and recreate with new content to maintain chunking logic properly
        const metadata = {
            name: currentEditingFile.name,
            type: currentEditingFile.type,
            size: newText.length, // approximate size
            parentFolder: currentEditingFile.parentFolder,
            data: newDataUrl
        };

        StorageManager.deleteFile(currentEditingFile.id, true); // Hard delete old
        StorageManager.saveFile(metadata); // Save new

        editorFooter.classList.add('hidden');
        previewModal.classList.remove('active');
        overlay.classList.add('hidden');
        currentEditingFile = null;
        
        alert("File saved successfully.");
    }

    return {
        init,
        openPreview
    };
})();
