window.allProducts = [];
window.filteredProducts = [];
window.rawCategoriesData = []; 
window.currentPage = 1;
window.itemsPerPage = 20; //скільки товарів відображається на сторінці
window.activeParamFilters = {}; // Сховище для обраних чекбоксів (наприклад, {"Колір": ["сірий меланж"]})

window.onFilterChange = function() {
    updateUrlParams();
};

// 1. Головна функція завантаження товарів та ініціалізації динамічних фільтрів
async function loadProducts() {
    const container = document.getElementById('productsContainer');
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Завантаження...</span>
            </div>
            <p class="mt-2 text-muted fw-bold">Завантаження каталогу товарів...</p>
        </div>`;

    cartModal = new bootstrap.Modal(document.getElementById('cartModal'));
    successModal = new bootstrap.Modal(document.getElementById('successModal'));
    
    const savedCart = localStorage.getItem('dropshop_cart');
    if (savedCart) {
        try { cart = JSON.parse(savedCart); } catch (e) { cart = []; }
    }

    const phoneInput = document.getElementById('clientPhone');
    if (phoneInput) {
        phoneInput.addEventListener('focus', () => { if (!phoneInput.value.startsWith('+380')) phoneInput.value = '+380'; });
        phoneInput.addEventListener('input', () => { if (!phoneInput.value.startsWith('+380')) phoneInput.value = '+380'; });
    }

    // Слухачі для базових полів фільтрації
    document.getElementById('categoryFilter').onchange = () => { console.log('Category changed!'); updateUrlParams(); };
    document.getElementById('search').addEventListener('input', updateUrlParams);
    document.getElementById('priceSort').addEventListener('change', updateUrlParams);
    document.getElementById('priceMin').addEventListener('input', updateUrlParams);
    document.getElementById('priceMax').addEventListener('input', updateUrlParams);

    try {
        const response = await fetch('products.json');
        const rawData = await response.json();
        
        let root = rawData.yml_catalog ? rawData.yml_catalog.shop : (rawData.shop || rawData);
        rawCategoriesData = root.categories ? (root.categories.category || root.categories) : [];
        const rawOffers = root.offers ? (root.offers.offer || root.offers) : [];
        if (Array.isArray(rawOffers)) {
            allProducts = rawOffers;
        } else if (rawOffers) {
            allProducts = [rawOffers];
        }

        // Оптимізація: конвертуємо ціну в число одразу
        allProducts.forEach(p => p.price = parseFloat(p.price || 0));
        if (allProducts.length === 0) {
            container.innerHTML = `<div class="col-12 text-center text-warning py-5"><h5>Товари відсутні або мають невірну структуру.</h5></div>`;
            return;
        }
        
        generateCategoryOptions();
        syncCartWithFreshJson(); 
        
        // Генеруємо бічні динамічні фільтри на основі параметрів товарів
        buildDynamicParamFilters();
        
        // Відновлюємо стан усіх фільтрів, які збережені в URL
        restoreFiltersFromUrl();

        checkUrlRoute();
        updateCartBadge(); 

        window.addEventListener('popstate', checkUrlRoute);
    } catch (error) {
        container.innerHTML = `<div class="col-12 text-center text-danger py-5"><h5>Помилка обробки файлу products.json</h5></div>`;
        console.error("Критична помилка завантаження:", error);
    }
}

// 2. Збір унікальних характеристик та побудова чекбоксів у лівій колонці
// 2. Збір унікальних характеристик та побудова АКОРДЕОНУ фільтрів
function buildDynamicParamFilters() {
    const container = document.getElementById('dynamicFiltersContainer');
    container.innerHTML = '';

    const targetParams = ["особливості", "Колір", "Стать", "Высота", "Ширина", "Глубина", "Матеріал", "Об`єм"];
    const extractedData = {};

    targetParams.forEach(p => extractedData[p] = new Set());

    allProducts.forEach(item => {
        if (item.param) {
            const paramsList = Array.isArray(item.param) ? item.param : [item.param];
            paramsList.forEach(p => {
                if (p && targetParams.includes(p["@name"]) && p["#text"]) {
                    const value = p["#text"].toString().trim();
                    if (value !== '') extractedData[p["@name"]].add(value);
                }
            });
        }
    });

    // Створюємо акордеон
    const accordionId = 'filtersAccordion';
    container.innerHTML = `<div class="accordion" id="${accordionId}"></div>`;
    const accordion = container.querySelector(`#${accordionId}`);

    let index = 0;
    for (const paramName in extractedData) {
        const uniqueValues = [...extractedData[paramName]].sort();
        if (uniqueValues.length === 0) continue;

        const itemId = `collapse_${index}`;
        const headerId = `heading_${index}`;

        const filterGroup = document.createElement('div');
        filterGroup.className = 'accordion-item border-0 mb-2';
        filterGroup.innerHTML = `
            <h2 class="accordion-header" id="${headerId}">
                <button class="accordion-button collapsed py-2 px-0 bg-transparent shadow-none fw-bold text-dark" type="button" data-bs-toggle="collapse" data-bs-target="#${itemId}">
                    ${paramName}
                </button>
            </h2>
            <div id="${itemId}" class="accordion-collapse collapse" data-bs-parent="#${accordionId}">
                <div class="accordion-body px-0 py-2" id="body_${itemId}"></div>
            </div>`;

        const body = filterGroup.querySelector(`#body_${itemId}`);
        uniqueValues.forEach(val => {
            const checkBlock = document.createElement('div');
            checkBlock.className = 'form-check';
            checkBlock.innerHTML = `
                <input class="form-check-input param-checkbox" type="checkbox" data-param="${paramName}" value="${val}" id="chk_${paramName}_${val}">
                <label class="form-check-label small" for="chk_${paramName}_${val}">${val}</label>
            `;
            checkBlock.querySelector('input').addEventListener('change', updateUrlParams);
            body.appendChild(checkBlock);
        });

        accordion.appendChild(filterGroup);
        index++;
    }
}

// 3. Збір активних фільтрів та запис усього ланцюжка параметрів в URL
function updateUrlParams() {
    console.log("updateUrlParams викликано"); // Додайте це для дебагу

    const cat = document.getElementById('categoryFilter').value;
    const search = document.getElementById('search').value.trim();
    const sort = document.getElementById('priceSort').value;
    const minP = document.getElementById('priceMin').value;
    const maxP = document.getElementById('priceMax').value;

    const params = new URLSearchParams();
    if (cat !== 'all') params.set('category', cat);
    if (search !== '') params.set('search', search);
    if (sort !== 'default') params.set('sort', sort);
    if (minP !== '') params.set('minPrice', minP);
    if (maxP !== '') params.set('maxPrice', maxP);

    // Збираємо стан усіх клікнутих чекбоксів
    activeParamFilters = {};
    document.querySelectorAll('.param-checkbox:checked').forEach(chk => {
        const pName = chk.getAttribute('data-param');
        const pVal = chk.value;
        if (!activeParamFilters[pName]) activeParamFilters[pName] = [];
        activeParamFilters[pName].push(pVal);
    });

    // Записуємо обрані параметри фільтрів у рядок URL
    for (const paramName in activeParamFilters) {
        params.set('p_' + paramName, activeParamFilters[paramName].join(','));
    }

    const productId = new URLSearchParams(window.location.search).get('id');
    if (productId) params.set('id', productId);

    const newUrl = params.toString() ? '?' + params.toString() : window.location.pathname;
    history.replaceState({}, "", newUrl);
    
    // ВАЖЛИВО: Обов'язково викликати оновлення вигляду!
    showCatalogView();
}

function changeItemsPerPage() {
    window.itemsPerPage = parseInt(document.getElementById('itemsPerPageSelect').value);
    currentPage = 1; // Скидаємо на 1 сторінку
    displayPage(1);
}

// 4. Функція відновлення стану при перезавантаженні сторінки (F5)
function restoreFiltersFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Відновлюємо базові поля
    document.getElementById('categoryFilter').value = urlParams.get('category') || 'all';
    document.getElementById('search').value = urlParams.get('search') || '';
    document.getElementById('priceSort').value = urlParams.get('sort') || 'default';
    document.getElementById('priceMin').value = urlParams.get('minPrice') || '';
    document.getElementById('priceMax').value = urlParams.get('maxPrice') || '';

    // Відновлюємо галочки на чекбоксах характеристик
    activeParamFilters = {};
    urlParams.forEach((value, key) => {
        if (key.startsWith('p_')) {
            const paramName = key.replace('p_', '');
            const valuesArray = value.split(',');
            activeParamFilters[paramName] = valuesArray;

            valuesArray.forEach(val => {
                const chk = document.getElementById(`chk_${paramName}_${val}`);
                if (chk) chk.checked = true;
            });
        }
    });
}

// 5. Перевірка роутингу сторінок
function checkUrlRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (productId) {
        showProductDetail(parseInt(productId));
    } else {
        showCatalogView();
    }
}

// Переконайтеся, що цей код є у вас в loadProducts або в області видимості
window.addEventListener('popstate', () => {
    // При натисканні "Назад" URL змінюється. 
    // Спочатку оновлюємо DOM фільтрів (галочки, інпути)
    restoreFiltersFromUrl(); 
    // Потім викликаємо перевірку роуту (каталог чи детальна сторінка)
    checkUrlRoute(); 
});


// 6. Відображення детальної сторінки товару (Зчитування YML-структури)
function showProductDetail(id) {
    const product = allProducts.find(item => parseInt(item["@id"]) === id);
    if (!product) {
        showCatalogView();
        return;
    }

    document.getElementById('catalogView').classList.add('d-none');
    document.getElementById('productDetailView').classList.remove('d-none');

    let imagesArray = [];
    if (product.picture) {
        imagesArray = Array.isArray(product.picture) ? product.picture : [product.picture];
    }

    let thumbsHtml = '';
    if (imagesArray.length > 1) {
        thumbsHtml = '<div class="d-flex gap-2 justify-content-center mt-3 flex-wrap">';
        imagesArray.forEach((imgUrl, index) => {
            thumbsHtml += '<img src="' + imgUrl + '" class="img-thumbnail thumb-img ' + (index === 0 ? 'active' : '') + '" alt="Мініатюра" onclick="changeDetailImage(this, \'' + imgUrl + '\')">';
        });
        thumbsHtml += '</div>';
    }

    const catId = product.categoryId;
    const categoriesArray = Array.isArray(rawCategoriesData) ? rawCategoriesData : [rawCategoriesData];
    const categoryObj = categoriesArray.find(c => c && c["@id"] === catId);
    const categoryName = categoryObj ? categoryObj["#text"] : "Каталог";

    let paramsHtml = '';
    if (product.param) {
        const paramsList = Array.isArray(product.param) ? product.param : [product.param];
        paramsHtml = '<div class="mt-3 border-top pt-2"><h6 class="fw-bold text-secondary">Характеристики:</h6><ul class="list-unstyled small text-muted">';
        paramsList.forEach(p => {
            if (!p) return;
            const unit = p["@unit"] ? ' ' + p["@unit"] : '';
            paramsHtml += `<li>• <b>${p["@name"]}:</b> ${p["#text"]}${unit}</li>`;
        });
        paramsHtml += '</ul></div>';
    }

    const mainImgSrc = imagesArray.length > 0 ? imagesArray[0] : 'img/no-image.jpg';
    const productDescription = product.description ? product.description : 'Опис товару незабаром з\'явиться.';

    const detailContainer = document.getElementById('productDetailContainer');

    detailContainer.innerHTML = `
        <div class="col-md-6 text-center">
            <!-- Тільки велике фото має клас gallery-item -->
            <a href="${mainImgSrc}" data-pswp-width="1000" data-pswp-height="1000" class="gallery-item" target="_blank">
                <img src="${mainImgSrc}" id="mainProductImage" class="img-fluid rounded border p-2" alt="${product.name}">
            </a>
            
            <!-- Мініатюри: без <a>, щоб не було дублювання в лайтбоксі -->
            <div class="d-flex gap-2 justify-content-center mt-3 overflow-auto pb-2">
                ${imagesArray.map((img, i) => `
                    <!-- Додаємо клас gallery-item, щоб PhotoSwipe бачив їх як частину галереї -->
                    <a href="${img}" data-pswp-width="1000" data-pswp-height="1000" class="gallery-item" 
                    onclick="event.preventDefault(); changeDetailImage(document.getElementById('mainProductImage'), '${img}', ${i})">
                        <img src="${img}" class="thumb-img border rounded ${i === 0 ? 'active' : ''}" 
                            style="width: 80px; height: 80px; object-fit: cover;">
                    </a>
                `).join('')}
            </div>
        </div>
        <div class="col-md-6 d-flex flex-column justify-content-center">
            <span class="badge bg-secondary align-self-start mb-2 text-uppercase fs-7">${categoryName}</span>
            <h2 class="fw-bold mb-2">${product.name}</h2>
            <h3 class="text-success fw-bold mb-3">${product.price} грн</h3>
            <div class="mb-4 text-dark fs-6 border-top border-bottom py-3" style="line-height: 1.6;">
                <h5 class="fw-bold text-secondary mb-2">📋 Опис товару:</h5>
                <div>${productDescription}</div>
                ${paramsHtml}
            </div>
            <button class="btn btn-primary btn-lg py-3 fw-bold shadow-sm" onclick="addToCart(${parseInt(product["@id"])})">Додати в кошик 🛒</button>
        </div>`;

    // Після оновлення DOM:
    if (window.pswpLightbox) {
        window.pswpLightbox.destroy(); // Очищуємо старий інстанс
        
        // Створюємо масив джерел з усіх картинок
        const slides = imagesArray.map(src => ({
            src: src,
            width: 1000, // PhotoSwipe потребує розміри, можна залишити фіксовані
            height: 1000
        }));

        // Ініціалізуємо лайтбокс, вказуючи йому dataSource
        window.pswpLightbox.options.dataSource = slides;
        window.pswpLightbox.init();
    }

    const videoBlock = document.getElementById('productVideoBlock');
    const iframeContainer = document.getElementById('videoIframeContainer');
    
    if (product.youtube && product.youtube.toString().trim() !== "") {
        const rawId = product.youtube.toString().trim();
        // Припускаємо, що в JSON приходить ID відео або повне посилання
        // Правильний формат для вбудовування: https://www.youtube.com/embed/VIDEO_ID
        const videoId = rawId.includes('v=') ? rawId.split('v=')[1].split('&')[0] : rawId.split('/').pop();
        
        videoBlock.classList.remove('d-none');
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}`; // Виправлено
        iframe.width = "100%";
        iframe.height = "315";
        iframe.title = "YouTube video player";
        iframe.frameBorder = "0";
        iframe.setAttribute("allowfullscreen", "true");
        iframeContainer.innerHTML = ''; 
        iframeContainer.appendChild(iframe); 
    } else {
        videoBlock.classList.add('d-none');
        iframeContainer.innerHTML = ''; 
    }
    window.scrollTo(0, 0);
}

// 7. Зміна фото в галереї мініатюр
function changeDetailImage(imgElement, newSrc, index) {
    imgElement.src = newSrc;
    
    // Оновлюємо посилання для лайтбокса, щоб він знав, що відкривати при кліку на фото
    const link = document.querySelector('.gallery-item');
    if (link) {
        link.href = newSrc;
    }

    // Підсвітка активної мініатюри
    document.querySelectorAll('.thumb-img').forEach(img => img.classList.remove('active'));
    // Використовуємо індекс, щоб знайти потрібну мініатюру
    const thumbWrappers = document.querySelectorAll('.thumb-wrapper img');
    if(thumbWrappers[index]) {
        thumbWrappers[index].classList.add('active');
    }
}




// 8. ГЛИБОКА ФІЛЬТРАЦІЯ ХАРАКТЕРИСТИК, ЦІН ТА ПОШУКУ
function showCatalogView() {
    // 1. Спочатку відновлюємо фільтри з URL, якщо ми не в детальному перегляді
    // (це забезпечить актуальність стану при поверненні)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) {
        urlParams.delete('id');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        history.replaceState({}, "", newUrl);
    }

    // 2. Тепер перемикаємо відображення
    document.getElementById('productDetailView').classList.add('d-none');
    document.getElementById('catalogView').classList.remove('d-none');
    document.getElementById('videoIframeContainer').innerHTML = ''; 
    
    const selectedCategory = document.getElementById('categoryFilter').value;
    const searchQuery = document.getElementById('search').value.toLowerCase();
    const minPrice = parseFloat(document.getElementById('priceMin').value) || 0;
    const maxPrice = parseFloat(document.getElementById('priceMax').value) || Infinity;
    const sortOrder = document.getElementById('priceSort').value;

    filteredProducts = allProducts.filter(item => {
        // Пошук за назвою
        const nameText = item.name ? item.name.toString().toLowerCase() : '';
        const matchesSearch = nameText.includes(searchQuery);

        // Фільтр за категорією
        const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;

        // Фільтр за ціною
        const currentPrice = item.price; // Вже число після оптимізації
        const matchesPrice = currentPrice >= minPrice && (maxPrice === Infinity ? true : currentPrice <= maxPrice);

        // Робота з чекбоксами
        let matchesParams = true;
        const itemParamsList = item.param ? (Array.isArray(item.param) ? item.param : [item.param]) : [];

        for (const paramName in activeParamFilters) {
            const selectedValues = activeParamFilters[paramName];
            if (selectedValues.length === 0) continue;

            // БЕЗПЕЧНИЙ ПОШУК: шукаємо параметр і перевіряємо, чи існує #text
            const foundParam = itemParamsList.find(p => p && p["@name"] === paramName);

            // Якщо параметр у товарі є, беремо його значення, інакше — порожній рядок
            const itemParamValue = (foundParam && foundParam["#text"]) ? foundParam["#text"].toString().trim() : '';

            // Якщо значення товару немає серед обраних галочок — відсіюємо його
            if (!selectedValues.includes(itemParamValue)) {
                matchesParams = false;
                break;
            }
        }

        return matchesSearch && matchesCategory && matchesPrice && matchesParams;
    });

    // Сортування цін
    if (sortOrder === 'low') filteredProducts.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
    if (sortOrder === 'high') filteredProducts.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));

    displayPage(currentPage);
}

// 9. Відображення карток у правій колонці
function displayPage(page) {
    currentPage = page;
    const container = document.getElementById('productsContainer');
    container.innerHTML = '';

    if (filteredProducts.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-5">Товарів за такими параметрами не знайдено 😔</div>';
        renderPagination();
        return;
    }

    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredProducts.slice(startIndex, endIndex);

    pageItems.forEach(item => {
        const itemId = parseInt(item["@id"]);
        let mainImage = 'img/no-image.jpg';
        if (item.picture) {
            mainImage = Array.isArray(item.picture) ? item.picture[0] : item.picture;
        }

        const col = document.createElement('div');
        col.className = 'col';
        col.innerHTML = `
            <div class="card h-100 shadow-sm product-card">
                <!-- Змінюємо виклик на правильну функцію -->
                <a href="?id=${itemId}" class="text-decoration-none text-dark" onclick="handleProductClick(event, ${itemId})">
                    <img src="${mainImage}" class="card-img-top p-2" alt="${item.name}">
                    <div class="card-body d-flex flex-column pb-0">
                        <h5 class="card-title fs-6 flex-grow-1 fw-bold text-truncate-2">${item.name || 'Bez nazvy'}</h5>
                        <p class="card-text text-success fw-bold fs-5 mb-2">${item.price || 0} грн</p>
                    </div>
                </a>
                <div class="card-body pt-0 mt-auto">
                    <button class="btn btn-primary w-100 fw-bold" onclick="addToCart(${itemId})">В кошик 🛒</button>
                </div>
            </div>`;
        container.appendChild(col);
    });
    renderPagination();
}

function handleProductClick(event, id) {
    if (event.metaKey || event.ctrlKey || event.button === 1) return;
    event.preventDefault(); 

    // Встановлюємо новий URL
    const newUrl = window.location.pathname + '?id=' + id;
    history.pushState({ id: id }, "", newUrl);

    // Викликаємо функцію, яка відображає товар
    showProductDetail(id);
}

function renderPagination() {
    const container = document.getElementById('paginationContainer');
    container.innerHTML = '';
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<button class="page-link" onclick="displayPage(${i})">${i}</button>`;
        container.appendChild(li);
    }
}

// 10. Кнопка швидкого скидання всього ланцюжка фільтрів
function resetAllFilters() {
    document.getElementById('search').value = '';
    document.getElementById('categoryFilter').value = 'all';
    document.getElementById('priceSort').value = 'default';
    document.getElementById('priceMin').value = '';
    document.getElementById('priceMax').value = '';
    
    document.querySelectorAll('.param-checkbox').forEach(chk => chk.checked = false);
    activeParamFilters = {};
    
    updateUrlParams();
}

function generateCategoryOptions() {
    const categorySelect = document.getElementById('categoryFilter');
    categorySelect.innerHTML = '<option value="all">Всі категорії</option>';
    const categoriesArray = Array.isArray(rawCategoriesData) ? rawCategoriesData : [rawCategoriesData];

    categoriesArray.forEach(cat => {
        if (!cat || !cat["@id"]) return;
        const option = document.createElement('option');
        option.value = cat["@id"];
        option.innerText = cat["#text"] || "Без назви";
        categorySelect.appendChild(option);
    });
}

window.resetAllFilters = resetAllFilters;
window.onload = loadProducts;



