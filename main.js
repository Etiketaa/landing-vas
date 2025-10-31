const menuBtn = document.getElementById("menu-btn");
const navLinks = document.getElementById("nav-links");
const menuBtnIcon = menuBtn.querySelector("i");

menuBtn.addEventListener("click", (e)=>{
    navLinks.classList.toggle("open");

    const isopen = navLinks.classList.contains("open");
    menuBtnIcon.setAttribute("class", isopen ? "ri-close-line" : "re-menu-line")
});


navLinks.addEventListener("click",(e)=>{
    navLinks.classList.remove("open");
    menuBtnIcon.setAttribute("class", "ri-close-line" )
})

const scrollRevealOption = {
    origin: "bottom",
    distance: "50px",
    duration: 1000,
  };
  
  // Correct way to use ScrollReveal:
  ScrollReveal().reveal(".header__image img", {
    ...scrollRevealOption,
    origin: "right",
  });

  ScrollReveal().reveal(".header__content p", {
    ...scrollRevealOption,
    delay: 500,
  });
  
  ScrollReveal().reveal(".header__content h1", {
    ...scrollRevealOption,
    delay: 1000,
  });

  ScrollReveal().reveal(".header__btns", {
    ...scrollRevealOption,
    delay: 1500,
  });

  ScrollReveal().reveal(".destination__card", {
    ...scrollRevealOption,
    interval: 500,
  });
  
    ScrollReveal().reveal(".showcase__image img", {
    ...scrollRevealOption,
    origin: "left",
  });

  ScrollReveal().reveal(".showcase__content h4", {
    ...scrollRevealOption,
    delay: 500,
  });
  
  ScrollReveal().reveal(".showcase__content p", {
    ...scrollRevealOption,
    delay: 1000,
  });

  ScrollReveal().reveal("showcase__btn", {
    ...scrollRevealOption,
    delay: 1500,
     });

       ScrollReveal().reveal(".banner__card", {
    ...scrollRevealOption,
    interval: 500,
  });
  
  ScrollReveal().reveal(".discover__card", {
  ...scrollRevealOption,
  interval: 500,
});


  const swiper = new Swiper(".swiper", {
    slidesPerView: 1,
    spaceBetween: 20,
    loop: true,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
  });

// Booking modal logic
const openBtn = document.getElementById('open-booking');
const modal = document.getElementById('booking-modal');
const overlay = document.getElementById('booking-overlay');
const closeBtn = document.getElementById('booking-close');
const form = document.getElementById('booking-form');
const msg = document.getElementById('booking-msg');

function openModal() {
  if (modal) modal.setAttribute('aria-hidden', 'false');
}
function closeModal() {
  if (modal) modal.setAttribute('aria-hidden', 'true');
}
openBtn?.addEventListener('click', openModal);
closeBtn?.addEventListener('click', closeModal);
overlay?.addEventListener('click', closeModal);

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Enviando...';
  const payload = {
    name: document.getElementById('booking-name').value.trim(),
    contact: document.getElementById('booking-contact').value.trim(),
    service: document.getElementById('booking-service').value,
    date: document.getElementById('booking-date').value,
    time: document.getElementById('booking-time').value,
    notes: document.getElementById('booking-notes').value.trim(),
  };
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    msg.textContent = 'Reservación solicitada. Te confirmaremos pronto.';
    form.reset();
    setTimeout(closeModal, 1500);
  } catch (err) {
    msg.textContent = 'Error al enviar. Intenta nuevamente.';
    console.error(err);
  }
});
