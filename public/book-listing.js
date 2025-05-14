document.addEventListener('DOMContentLoaded', () => {
    const loadingMainElement = document.getElementById('loading-main');
    const errorMainElement = document.getElementById('error-main');
    const comicsGridElement = document.getElementById('comics-grid');
    const resultsTitleElement = document.getElementById('results-title');

    const searchInputElement = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const loadDefaultButton = document.getElementById('load-default-button');

    const API_THUMB_BASE_URL = 'https://otruyenapi.com/uploads/comics/';
    const API_NEW_COMICS_URL = 'https://otruyenapi.com/v1/api/danh-sach/truyen-moi?page=1';
    const API_SEARCH_BASE_URL = 'https://otruyenapi.com/v1/api/tim-kiem?keyword=';

    function displayMessage(element, message) {
        element.innerHTML = `<p class="empty-message">${message}</p>`;
    }

    function createComicItemElement(comic) {
        const item = document.createElement('a');
        item.classList.add('comic-item');
        item.href = `/book/${comic.slug}`;

        const img = document.createElement('img');
        img.src = `${API_THUMB_BASE_URL}${comic.thumb_url}`;
        img.alt = comic.name;
        img.onerror = () => {
            img.src = 'https://via.placeholder.com/150x220.png?text=No+Image';
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

    async function fetchAndDisplayComics(apiUrl, title, isSearch = false) {
        loadingMainElement.style.display = 'block';
        errorMainElement.style.display = 'none';
        comicsGridElement.innerHTML = ''; // Clear previous results
        resultsTitleElement.textContent = title;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            const data = await response.json();

            let comics = [];
            // API structure can vary, common patterns:
            if (data && data.data && data.data.items && Array.isArray(data.data.items)) {
                comics = data.data.items;
            } else if (data && data.items && Array.isArray(data.items)) {
                comics = data.items;
            } else if (data && Array.isArray(data)) { // If API returns array directly
                 comics = data;
            }
             else {
                console.warn("API response format not recognized for:", title, data);
                throw new Error("Định dạng dữ liệu API không đúng.");
            }

            loadingMainElement.style.display = 'none';

            if (comics.length > 0) {
                // For search results, the API might return more items than for "new comics".
                // You might want to implement pagination for search if it returns many results.
                // For now, displaying all results from the first page of the search.
                comics.forEach(comic => {
                    if (comic.slug && comic.name && comic.thumb_url) {
                        comicsGridElement.appendChild(createComicItemElement(comic));
                    }
                });
            } else {
                displayMessage(comicsGridElement, `Không tìm thấy truyện nào cho "${isSearch ? searchInputElement.value : 'mục này'}".`);
            }

        } catch (error) {
            console.error(`Lỗi khi tải truyện (${title}):`, error);
            loadingMainElement.style.display = 'none';
            errorMainElement.textContent = `Không thể tải truyện: ${error.message}. Vui lòng thử lại.`;
            errorMainElement.style.display = 'block';
            displayMessage(comicsGridElement, `Không thể tải truyện.`);
        }
    }

    function performSearch() {
        const searchTerm = searchInputElement.value.trim();
        if (!searchTerm) {
            // Optionally, reload default list or show a message
            loadDefaultComics(); // Reload default if search is cleared by empty input
            loadDefaultButton.style.display = 'none';
            return;
        }
        fetchAndDisplayComics(
            `${API_SEARCH_BASE_URL}${encodeURIComponent(searchTerm)}`,
            `Kết Quả Tìm Kiếm cho "${searchTerm}"`,
            true
        );
        loadDefaultButton.style.display = 'inline-block'; // Show button to go back to default list
    }

    function loadDefaultComics() {
        fetchAndDisplayComics(API_NEW_COMICS_URL, 'Truyện Mới Cập Nhật');
        searchInputElement.value = ''; // Clear search input when loading default
        loadDefaultButton.style.display = 'none'; // Hide button as we are showing default
    }

    searchButton.addEventListener('click', performSearch);
    searchInputElement.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    loadDefaultButton.addEventListener('click', loadDefaultComics);

    // Load default comics (Truyện Mới) when the page loads
    loadDefaultComics();
});