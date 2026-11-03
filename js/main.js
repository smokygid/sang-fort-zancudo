document.addEventListener('DOMContentLoaded', () => {

  /* =========================================
     МОБИЛЬНОЕ МЕНЮ
  ========================================= */

  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.menu');

  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      menu.classList.toggle('open');
      menuButton.classList.toggle('active');

      const expanded = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', !expanded);
    });

    // Закрытие меню после выбора страницы
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menu.classList.remove('open');
        menuButton.classList.remove('active');
        menuButton.setAttribute('aria-expanded', 'false');
      });
    });
  }


  /* =========================================
     АКТИВНАЯ СТРАНИЦА В МЕНЮ
  ========================================= */

  let currentPage = window.location.pathname.split('/').pop();

  // Если открыта главная
  if (!currentPage || currentPage === '') {
    currentPage = 'index.html';
  }

  document.querySelectorAll('.menu a').forEach(link => {
    const linkPage = link.getAttribute('href');

    if (linkPage === currentPage) {
      link.classList.add('active');
    }
  });


  /* =========================================
     АВТОМАТИЧЕСКИЙ ГОД У ФУТЕРІ
  ========================================= */

  document.querySelectorAll('[data-year]').forEach(element => {
    element.textContent = new Date().getFullYear();
  });


  /* =========================================
     ПЛАВНА ПРОКРУТКА
  ========================================= */

  document.querySelectorAll('a[href^="#"]').forEach(link => {

    link.addEventListener('click', event => {

      const targetId = link.getAttribute('href');

      if (!targetId || targetId === '#') {
        return;
      }

      const target = document.querySelector(targetId);

      if (target) {
        event.preventDefault();

        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }

    });

  });


  /* =========================================
     АНИМАЦИЯ ПОЯВЛЕНИЯ БЛОКОВ
  ========================================= */

  const animatedElements = document.querySelectorAll(
    '.card, .unit-card, .rank-card, .step, .news-card, .contact-card'
  );

  if ('IntersectionObserver' in window && animatedElements.length) {

    const observer = new IntersectionObserver(
      entries => {

        entries.forEach(entry => {

          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }

        });

      },
      {
        threshold: 0.12
      }
    );

    animatedElements.forEach(element => {
      observer.observe(element);
    });

  }


  /* =========================================
     ЗАХИСТ ВІД ПОМИЛКИ З ПОСИЛАННЯМИ
  ========================================= */

  document.querySelectorAll('a').forEach(link => {

    const href = link.getAttribute('href');

    if (!href) {
      return;
    }

    // Поки що не показуємо помилку для службових #
    if (href === '#') {
      link.addEventListener('click', event => {
        event.preventDefault();
      });
    }

  });



  /* =========================================
     SEASONAL THEME — calendar-based, public pages only
  ========================================= */
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();

  let season = 'winter';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'autumn';

  let holiday = '';
  let seasonalMessage = 'FORT ZANCUDO • СЕЗОННИЙ РЕЖИМ';

  if (month === 11 && day >= 23 && day <= 27) {
    holiday = 'thanksgiving';
    seasonalMessage = 'THANKSGIVING • ЧАС ПОДЯКИ ТА ЄДНОСТІ';
  } else if (month === 12 && day >= 20 && day <= 26) {
    holiday = 'christmas';
    seasonalMessage = 'CHRISTMAS SEASON • СВЯТКОВИЙ ПЕРІОД';
  } else if ((month === 12 && day >= 29) || (month === 1 && day <= 2)) {
    holiday = 'new-year';
    seasonalMessage = 'NEW YEAR • НОВИЙ РІК — НОВІ ЗАВДАННЯ';
  } else if (season === 'winter') {
    seasonalMessage = 'ЗИМОВИЙ РЕЖИМ • FORT ZANCUDO';
  } else if (season === 'autumn') {
    seasonalMessage = 'ОСІННІЙ РЕЖИМ • FORT ZANCUDO';
  } else if (season === 'spring') {
    seasonalMessage = 'ВЕСНЯНИЙ РЕЖИМ • FORT ZANCUDO';
  } else {
    seasonalMessage = 'ЛІТНІЙ РЕЖИМ • FORT ZANCUDO';
  }

  document.body.dataset.season = season;
  if (holiday) document.body.dataset.holiday = holiday;

  const seasonalBar = document.createElement('div');
  seasonalBar.className = 'seasonal-bar';
  seasonalBar.setAttribute('role', 'note');
  seasonalBar.innerHTML = '<span class="seasonal-bar__mark" aria-hidden="true">◆</span><span>' +
    seasonalMessage + '</span>';
  const siteHeader = document.querySelector('header');
  if (siteHeader && siteHeader.parentNode) {
    siteHeader.parentNode.insertBefore(seasonalBar, siteHeader.nextSibling);
  } else {
    document.body.insertBefore(seasonalBar, document.body.firstChild);
  }


});
