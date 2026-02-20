/* ==========================================================================
   Natural Abundance — Main JavaScript
   Nav toggle, scroll animations, lightbox, smooth scroll
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* --- Mobile Nav Toggle --- */
  const hamburger = document.querySelector('.nav__hamburger');
  const navLinks = document.querySelector('.nav__links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
    });

    // Close nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
      });
    });
  }

  /* --- Scroll-triggered Fade Up --- */
  const fadeEls = document.querySelectorAll('.fade-up');

  if (fadeEls.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeEls.forEach(el => observer.observe(el));
  }

  /* --- Lightbox --- */
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const lightboxImg = lightbox.querySelector('.lightbox__img');
    const lightboxCaption = lightbox.querySelector('.lightbox__caption');
    const closeBtn = lightbox.querySelector('.lightbox__close');
    const prevBtn = lightbox.querySelector('.lightbox__nav--prev');
    const nextBtn = lightbox.querySelector('.lightbox__nav--next');

    let galleryItems = [];
    let currentIndex = 0;

    // Gather all lightbox-trigger elements
    document.querySelectorAll('[data-lightbox]').forEach((item, i) => {
      galleryItems.push({
        src: item.getAttribute('data-lightbox'),
        caption: item.getAttribute('data-caption') || ''
      });

      item.addEventListener('click', (e) => {
        e.preventDefault();
        currentIndex = i;
        openLightbox();
      });
    });

    function openLightbox() {
      if (galleryItems.length === 0) return;
      lightboxImg.src = galleryItems[currentIndex].src;
      lightboxCaption.textContent = galleryItems[currentIndex].caption;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }

    function showNext() {
      currentIndex = (currentIndex + 1) % galleryItems.length;
      lightboxImg.src = galleryItems[currentIndex].src;
      lightboxCaption.textContent = galleryItems[currentIndex].caption;
    }

    function showPrev() {
      currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
      lightboxImg.src = galleryItems[currentIndex].src;
      lightboxCaption.textContent = galleryItems[currentIndex].caption;
    }

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', showPrev);
    if (nextBtn) nextBtn.addEventListener('click', showNext);

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') showNext();
      if (e.key === 'ArrowLeft') showPrev();
    });
  }

  /* --- Smooth Scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* --- Active nav link based on current page --- */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* --- Testimonial Carousel --- */
  document.querySelectorAll('.testimonial-carousel').forEach(carousel => {
    const slides = carousel.querySelectorAll('.testimonial-carousel__slide');
    const dots = carousel.querySelectorAll('.testimonial-carousel__dot');
    if (slides.length === 0) return;

    let current = 0;
    let interval;

    function goToSlide(index) {
      slides[current].classList.remove('active');
      if (dots[current]) dots[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');
    }

    function nextSlide() {
      goToSlide((current + 1) % slides.length);
    }

    function startAutoplay() {
      interval = setInterval(nextSlide, 7000);
    }

    function resetAutoplay() {
      clearInterval(interval);
      startAutoplay();
    }

    // Dot click handlers
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goToSlide(i);
        resetAutoplay();
      });
    });

    // Pause on hover
    carousel.addEventListener('mouseenter', () => clearInterval(interval));
    carousel.addEventListener('mouseleave', startAutoplay);

    // Initialize
    slides[0].classList.add('active');
    if (dots[0]) dots[0].classList.add('active');
    startAutoplay();
  });

});
