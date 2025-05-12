document.addEventListener('DOMContentLoaded', () => {
    const loadingElement = document.getElementById('loading');
    const errorMessageElement = document.getElementById('error-message');
    const chapterContentArea = document.getElementById('chapter-content-area');
    const chapterTitleElement = document.getElementById('chapter-title');
    const imagesDisplayElement = document.getElementById('images-display');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfoElement = document.getElementById('page-info');
    const backButton = document.getElementById('back-button');

    let chapterImages = [];
    let currentPage = 0;
    const imagesPerPage = 2; // Display 2 images per page

    const chapterId = window.location.pathname.split('/').pop();

    if (!chapterId) {
        showError('Không tìm thấy ID chương.');
        return;
    }

    function showError(message) {
        loadingElement.style.display = 'none';
        chapterContentArea.style.display = 'none';
        errorMessageElement.textContent = message;
        errorMessageElement.style.display = 'block';
    }

    async function fetchChapterContent() {
        try {
            const response = await fetch(`https://sv1.otruyencdn.com/v1/api/chapter/${chapterId}`);
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            const data = await response.json();

            if (data && data.data && data.data.item) {
                const item = data.data.item;
                chapterTitleElement.textContent = item.comic_name ? `${item.comic_name} - ${item.chapter_name}` : `Chương ${item.chapter_name}`;
                
                const domain = data.data.domain_cdn;
                const path = item.chapter_path;
                chapterImages = item.chapter_image.map(img => ({
                    id: img.image_page,
                    url: `${domain}/${path}/${img.image_file}`,
                }));

                renderImages();
                loadingElement.style.display = 'none';
                chapterContentArea.style.display = 'block';
            } else {
                showError('Không tìm thấy dữ liệu chương.');
            }
        } catch (error) {
            console.error('Lỗi khi tải nội dung chương:', error);
            showError(`Lỗi khi tải nội dung chương: ${error.message}`);
        }
    }

    function renderImages() {
        imagesDisplayElement.innerHTML = ''; // Clear previous images
        const startIndex = currentPage * imagesPerPage;
        const endIndex = startIndex + imagesPerPage;
        const imagesToShow = chapterImages.slice(startIndex, endIndex);

        imagesToShow.forEach(imgData => {
            const imgElement = document.createElement('img');
            imgElement.src = imgData.url;
            imgElement.alt = `Trang ${imgData.id}`;
            imagesDisplayElement.appendChild(imgElement);
        });
        updateImageNavigation();
    }
    
    function updateImageNavigation() {
        const totalPages = Math.ceil(chapterImages.length / imagesPerPage);
        pageInfoElement.textContent = `Trang ${currentPage + 1} / ${totalPages}`;
        prevPageButton.disabled = currentPage === 0;
        nextPageButton.disabled = (currentPage + 1) * imagesPerPage >= chapterImages.length;
    }

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            renderImages();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    nextPageButton.addEventListener('click', () => {
        if ((currentPage + 1) * imagesPerPage < chapterImages.length) {
            currentPage++;
            renderImages();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    backButton.addEventListener('click', () => {
        window.history.back();
    });

    fetchChapterContent();
});

// At the end of public/chapter-view.js (outside DOMContentLoaded if not already)
function triggerNextPage() {
    const nextPageButton = document.getElementById('next-page');
    if (nextPageButton && !nextPageButton.disabled) {
        console.log("Programmatically clicking Next Page");
        nextPageButton.click();
    }
}

function triggerPrevPage() {
    const prevPageButton = document.getElementById('prev-page');
    if (prevPageButton && !prevPageButton.disabled) {
        console.log("Programmatically clicking Previous Page");
        prevPageButton.click();
    }
}

// Make them available to gesture-navigation.js
window.triggerNextPage = triggerNextPage;
window.triggerPrevPage = triggerPrevPage;