// public/theme-switcher.js
document.addEventListener('DOMContentLoaded', () => {
    // ***** CRITICAL: Ensure this ID matches the button ID in ALL your HTML files *****
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const bodyElement = document.body;

    // Function to apply the theme and update button text
    function applyTheme(theme) {
        if (theme === 'dark') {
            bodyElement.classList.add('dark-theme');
            if (themeToggleButton) themeToggleButton.textContent = 'Chế Độ Sáng'; // Text for when it's dark
            localStorage.setItem('theme', 'dark');
        } else { // 'light' or any other case
            bodyElement.classList.remove('dark-theme');
            if (themeToggleButton) themeToggleButton.textContent = 'Chế Độ Tối'; // Text for when it's light
            localStorage.setItem('theme', 'light');
        }
    }

    // Check for saved theme preference on load
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        // Default theme logic (e.g., light or system preference)
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme('dark');
        } else {
            applyTheme('light'); // Default to light
        }
    }

    // Add event listener to the toggle button
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            // Check current state by looking at the body class
            if (bodyElement.classList.contains('dark-theme')) {
                applyTheme('light'); // Switch to light
            } else {
                applyTheme('dark');  // Switch to dark
            }
        });
    } else {
        // This warning is helpful for debugging if the button isn't found
        console.warn('Theme toggle button with ID "theme-toggle-button" not found.');
    }
});