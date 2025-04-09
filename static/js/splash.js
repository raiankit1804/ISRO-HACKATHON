document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const mainContent = document.getElementById('main-content');
    const body = document.body;
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navbar = document.querySelector('.navbar');
    const navLinkItems = document.querySelectorAll('.nav-links li');

    // --- Splash Screen Logic --- 
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
        }

        // Wait for splash screen fade-out transition to complete
        setTimeout(() => {
            if (splashScreen) {
                splashScreen.style.display = 'none';
            }
            if (mainContent) {
                mainContent.classList.remove('hidden');
                mainContent.classList.add('visible');
            }
            // Restore scrolling on body
            body.style.overflowY = 'auto';
        }, 800);

    }, 2500);

    // --- Hamburger Menu Toggle --- 
    hamburger?.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent document click from immediately closing
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    });

    // --- Close Mobile Menu on Link Click --- 
    navLinkItems.forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });
    });

    // --- Close Mobile Menu on Clicking Outside --- 
    document.addEventListener('click', (e) => {
        if (navLinks.classList.contains('active') && 
            !navLinks.contains(e.target) && 
            !hamburger.contains(e.target)) {
            navLinks.classList.remove('active');
            hamburger.classList.remove('active');
        }
    });

    // --- Navbar Scroll Animation --- 
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });

    // Add active state to current page link
    const currentPath = window.location.pathname;
    const navAnchors = document.querySelectorAll('.nav-links a');
    
    navAnchors.forEach(anchor => {
        if (anchor.getAttribute('href') === currentPath) {
            anchor.classList.add('active');
        }
    });
});