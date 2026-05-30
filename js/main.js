// ============================================
// Axiom Shift — Main JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
  
  // Header background on scroll
  const header = document.querySelector('header');
  window.addEventListener('scroll', function() {
    if (window.scrollY > 100) {
      header.style.background = 'rgba(15, 15, 15, 0.98)';
    } else {
      header.style.background = 'rgba(15, 15, 15, 0.95)';
    }
  });
  
  // Contact form handling
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Get form data
      const formData = new FormData(this);
      const data = Object.fromEntries(formData);
      
      // Basic validation
      if (!data.name || !data.email || !data.message) {
        alert('Please fill in all required fields.');
        return;
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        alert('Please enter a valid email address.');
        return;
      }
      
      // Show success message (in production, this would send to a backend)
      alert('Thank you for your message! We\'ll be in touch within 24 hours.');
      this.reset();
    });
  }
  
  // Intersection Observer for fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe service cards and process steps
  document.querySelectorAll('.service-card, .process-step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
  
  // Add fade-in CSS class functionality
  const style = document.createElement('style');
  style.textContent = `
    .fade-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);
  
  // Logo image error handling — fall back to text
  const logoImg = document.querySelector('#logo');
  if (logoImg) {
    logoImg.onerror = function() {
      this.style.display = 'none';
      const logoLink = this.parentElement;
      logoLink.textContent = 'AXIOM SHIFT';
    };
  }
  
  // Calendly widget placeholder handler
  const calendlyWidget = document.getElementById('calendly-embed');
  if (calendlyWidget) {
    // In production, replace this placeholder with actual Calendly embed
    // Example:
    // Calendly.initInlineWidget({
    //   url: 'https://calendly.com/your-link',
    //   parentElement: calendlyWidget,
    //   prefill: {},
    //   utm: {}
    // });
  }
  
});

// Navbar toggle for mobile (if needed in future)
function toggleMobileNav() {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    navLinks.classList.toggle('mobile-open');
  }
}