document.addEventListener('DOMContentLoaded', () => {
    const loadingElement = document.getElementById('loading');
    const errorMessageElement = document.getElementById('error-message');
    const bookContentElement = document.getElementById('book-content');
    const bookNameElement = document.getElementById('book-name');
    const bookThumbElement = document.getElementById('book-thumb');
    const bookDescriptionElement = document.getElementById('book-description');
    const chaptersGridElement = document.getElementById('chapters-grid');
    const prevChaptersButton = document.getElementById('prev-chapters');
    const nextChaptersButton = document.getElementById('next-chapters');
    const chapterPageInfoElement = document.getElementById('chapter-page-info');
    const backButton = document.getElementById('back-button');
    
    let allChapters = [];
    let currentChapterPageIndex = 0;
    const chaptersPerPage = 8; // Display more chapters per page

    // This is how the client-side JS gets the slug from the URL
    const slug = window.location.pathname.split('/').pop();

    if (!slug) {
        showError('Không tìm thấy slug truyện.');
        return;
    }

    function showError(message) {
        loadingElement.style.display = 'none';
        bookContentElement.style.display = 'none';
        errorMessageElement.textContent = message;
        errorMessageElement.style.display = 'block';
    }

    function cleanContent(rawContent) {
        if (!rawContent) return "";
        let cleanedContent = rawContent.replace(/<\/?p>/g, ""); // Remove <p> tags
        cleanedContent = cleanedContent.replace(/^19\s*/, ""); // Remove leading "19 "
        return cleanedContent.length > 500
            ? cleanedContent.slice(0, 500) + "..."
            : cleanedContent.trim();
    }

    async function fetchBookDetail() {
        try {
            // Uses the extracted slug
            const response = await fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${slug}`); 
            if (!response.ok) {
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }
            const data = await response.json();

            if (data && data.data && data.data.item) {
                const book = data.data.item;
                bookNameElement.textContent = book.name;
                bookThumbElement.src = `https://otruyenapi.com/uploads/comics/${book.thumb_url}`;
                bookThumbElement.alt = book.name;
                bookDescriptionElement.innerHTML = cleanContent(book.content) || "Không có mô tả.";

                if (book.chapters && book.chapters[0] && book.chapters[0].server_data) {
                    allChapters = book.chapters[0].server_data;
                    renderChapters();
                } else {
                    chaptersGridElement.innerHTML = '<p>Không có chương nào.</p>';
                }
                loadingElement.style.display = 'none';
                bookContentElement.style.display = 'block';
            } else {
                showError('Không tìm thấy dữ liệu truyện.');
            }
        } catch (error) {
            console.error('Lỗi khi tải chi tiết truyện:', error);
            showError(`Lỗi khi tải chi tiết truyện: ${error.message}`);
        }
    }

    function renderChapters() {
        chaptersGridElement.innerHTML = ''; // Clear previous chapters
        const startIndex = currentChapterPageIndex * chaptersPerPage;
        const endIndex = startIndex + chaptersPerPage;
        const chaptersToShow = allChapters.slice(startIndex, endIndex);

        if (chaptersToShow.length === 0 && currentChapterPageIndex > 0) { // If on a page with no chapters (e.g. after deleting)
            currentChapterPageIndex--;
            renderChapters();
            return;
        }
        
        chaptersToShow.forEach(chapter => {
            const chapterElement = document.createElement('a');
            chapterElement.classList.add('chapter-button');
            const chapterId = chapter.chapter_api_data.split("/").pop();

            chapterElement.href = `/chapter/${chapterId}`; // Link to chapter view
            chapterElement.textContent = `Chap ${chapter.chapter_name}`;
            chaptersGridElement.appendChild(chapterElement);
        });

        updateChapterNavigation();
    }

    function updateChapterNavigation() {
        const totalPages = Math.ceil(allChapters.length / chaptersPerPage);
        chapterPageInfoElement.textContent = `Trang ${currentChapterPageIndex + 1} / ${totalPages}`;
        prevChaptersButton.disabled = currentChapterPageIndex === 0;
        nextChaptersButton.disabled = (currentChapterPageIndex + 1) * chaptersPerPage >= allChapters.length;
    }

    prevChaptersButton.addEventListener('click', () => {
        if (currentChapterPageIndex > 0) {
            currentChapterPageIndex--;
            renderChapters();
        }
    });

    nextChaptersButton.addEventListener('click', () => {
        if ((currentChapterPageIndex + 1) * chaptersPerPage < allChapters.length) {
            currentChapterPageIndex++;
            renderChapters();
        }
    });

    backButton.addEventListener('click', () => {
        window.history.back();
    });

    fetchBookDetail();
});