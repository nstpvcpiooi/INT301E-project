document.addEventListener('DOMContentLoaded', () => {
    const loadingMainElement = document.getElementById('loading-main');
    const errorMainElement = document.getElementById('error-main');
    const comicsContainerElement = document.getElementById('comics-container');
    const newComicsGridElement = document.getElementById('new-comics-grid');
    const hotComicsGridElement = document.getElementById('hot-comics-grid'); // Example for hot comics

    const API_THUMB_BASE_URL = 'https://otruyenapi.com/uploads/comics/';

    function showError(message) {
        loadingMainElement.style.display = 'none';
        comicsContainerElement.style.display = 'none';
        errorMainElement.textContent = message;
        errorMainElement.style.display = 'block';
    }

    function createComicItemElement(comic) {
        const item = document.createElement('a');
        item.classList.add('comic-item');
        item.href = `/book/${comic.slug}`; // Link to the book detail page

        const img = document.createElement('img');
        img.src = `${API_THUMB_BASE_URL}${comic.thumb_url}`;
        img.alt = comic.name;
        // Handle image loading errors gracefully
        img.onerror = () => {
            img.src = 'https://via.placeholder.com/150x200.png?text=No+Image'; // Fallback image
            img.alt = `${comic.name} (Image not found)`;
        };


        const name = document.createElement('div');
        name.classList.add('comic-name');
        name.textContent = comic.name;

        item.appendChild(img);
        item.appendChild(name);
        
        if (comic.chaptersLatest && comic.chaptersLatest[0] && comic.chaptersLatest[0].chapter_name) {
            const latestChapter = document.createElement('div');
            latestChapter.classList.add('latest-chapter');
            latestChapter.textContent = `Chap ${comic.chaptersLatest[0].chapter_name}`;
            item.appendChild(latestChapter);
        }


        return item;
    }

    async function fetchAndDisplayComics(apiUrl, gridElement, sectionTitle) {
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status} cho ${sectionTitle}`);
            }
            const data = await response.json();

            // The structure of data.items might vary based on the API endpoint
            // For /home, it might be data.data.items
            // For /danh-sach/truyen-moi, it might be data.items or data.data.items
            let comics = [];
            if (data && data.data && data.data.items && Array.isArray(data.data.items)) { // Common for /home
                comics = data.data.items;
            } else if (data && data.items && Array.isArray(data.items)) { // Common for /danh-sach/*
                comics = data.items;
            } else if (data && Array.isArray(data)) { // If the API returns an array directly
                 comics = data;
            } else {
                console.warn(`Dữ liệu không đúng định dạng cho ${sectionTitle}:`, data);
                gridElement.innerHTML = `<p>Không tìm thấy dữ liệu cho mục này hoặc định dạng API không đúng.</p>`;
                return;
            }
            
            gridElement.innerHTML = ''; // Clear previous items
            if (comics.length > 0) {
                // Limit the number of comics displayed per section for brevity
                comics.slice(0, 12).forEach(comic => { // Display up to 12 comics
                    if (comic.slug && comic.name && comic.thumb_url) {
                        gridElement.appendChild(createComicItemElement(comic));
                    }
                });
            } else {
                gridElement.innerHTML = `<p>Không có truyện nào trong mục này.</p>`;
            }

        } catch (error) {
            console.error(`Lỗi khi tải ${sectionTitle}:`, error);
            gridElement.innerHTML = `<p>Không thể tải danh sách truyện cho mục này. ${error.message}</p>`;
            // Don't hide everything if one section fails, just show error for that section
            // showError(`Không thể tải danh sách truyện. ${error.message}`);
        }
    }

    async function loadAllComics() {
        loadingMainElement.style.display = 'block';
        comicsContainerElement.style.display = 'none';
        errorMainElement.style.display = 'none';

        let hasError = false;

        // API endpoint for new comics (try /home first)
        // The /home endpoint often has multiple sections, you might need to parse it further
        // or find a more specific "new comics" endpoint.
        // Let's try fetching a general list for "Truyện Mới Cập Nhật"
        // This is an example, you may need to adjust API endpoint
        const newComicsApiUrl = 'https://otruyenapi.com/v1/api/danh-sach/truyen-moi?page=1';
        await fetchAndDisplayComics(newComicsApiUrl, newComicsGridElement, 'Truyện Mới Cập Nhật')
            .catch(() => hasError = true);


        // Example: API endpoint for "Hot" comics (this is a guess, you'll need to find the real one)
        // For demonstration, let's re-use the 'truyen-moi' or use 'hoan-thanh' as a placeholder
        const hotComicsApiUrl = 'https://otruyenapi.com/v1/api/danh-sach/hoan-thanh?page=1';
        await fetchAndDisplayComics(hotComicsApiUrl, hotComicsGridElement, 'Truyện Hot/Nổi Bật')
            .catch(() => hasError = true);

        // If at least one section loaded without critical error, show the container
        if (!hasError || (newComicsGridElement.children.length > 0 || hotComicsGridElement.children.length > 0)) {
            loadingMainElement.style.display = 'none';
            comicsContainerElement.style.display = 'block';
        } else if (hasError && newComicsGridElement.children.length === 0 && hotComicsGridElement.children.length === 0) {
            // If all fetches failed and no content was rendered
            showError('Không thể tải bất kỳ danh sách truyện nào. Vui lòng thử lại sau.');
        }
    }

    loadAllComics();
});