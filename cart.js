// === НАЛАШТУВАННЯ ВІДПРАВКИ ЗАМОВЛЕНЬ ===
const CLOUDFLARE_WORKER_URL = ""; 
const TG_TOKEN = "ВАШ_ТОКЕН_БОТА"; 
const TG_CHAT_ID = "ВАШ_CHAT_ID";

let cart = []; 
let cartModal;
let successModal;

function saveCartToStorage() {
    localStorage.setItem('dropshop_cart', JSON.stringify(cart));
}

function addToCart(id) {
    const product = allProducts.find(item => parseInt(item["@id"]) === id);
    const cartItem = cart.find(item => parseInt(item["@id"]) === id);

    if (cartItem) {
        cartItem.quantity += 1;
    } else {
        // Копіюємо об'єкт товару в кошик
        cart.push({ ...product, quantity: 1 });
    }

    saveCartToStorage(); 
    updateCartBadge();
    showToastNotification(`Товар додано до кошика!`);
}

function showToastNotification(text) {
    const toastContainer = document.createElement('div');
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '20px';
    toastContainer.style.right = '20px';
    toastContainer.style.zIndex = '9999';
    toastContainer.innerHTML = `
        <div class="bg-dark text-white p-3 rounded shadow-lg d-flex align-items-center gap-2" style="min-width: 250px;">
            <span>🛒</span> <span>${text}</span>
        </div>`;
    document.body.appendChild(toastContainer);
    setTimeout(() => { toastContainer.remove(); }, 2500);
}

function updateCartBadge() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').innerText = totalCount;
}

function openCartModal() {
    const listContainer = document.getElementById('cartItemsList');
    const form = document.getElementById('orderForm');
    listContainer.innerHTML = '';

    if (cart.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-muted py-3 fs-5">Ваш кошик порожній 😔</p>';
        form.style.display = 'none';
        document.getElementById('cartTotalDisplay').innerText = '0';
        cartModal.show();
        return;
    }

    form.style.display = 'block';
    let totalCartSum = 0;

    cart.forEach(item => {
        const priceNum = parseFloat(item.price);
        const itemSum = priceNum * item.quantity;
        totalCartSum += itemSum;

        const itemId = parseInt(item["@id"]);

        const row = document.createElement('div');
        row.className = 'd-flex align-items-center justify-content-between border-bottom py-2';
        row.innerHTML = `
            <div style="max-width: 50%;">
                <h6 class="mb-0 text-truncate">${item.name}</h6>
                <small class="text-muted">${item.price} грн / шт.</small>
            </div>
            <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-secondary" onclick="changeQuantity(${itemId}, -1)">-</button>
                <span class="fw-bold text-center" style="min-width: 25px;">${item.quantity}</span>
                <button type="button" class="btn btn-sm btn-secondary" onclick="changeQuantity(${itemId}, 1)">+</button>
                <button type="button" class="btn btn-sm btn-danger ms-2" onclick="removeFromCart(${itemId})">❌</button>
            </div>
        `;
        listContainer.appendChild(row);
    });

    document.getElementById('cartTotalDisplay').innerText = totalCartSum;
    cartModal.show();
}

function changeQuantity(id, change) {
    const cartItem = cart.find(item => parseInt(item["@id"]) === id);
    if (cartItem) {
        cartItem.quantity += change;
        if (cartItem.quantity <= 0) {
            removeFromCart(id);
            return;
        }
    }
    saveCartToStorage(); 
    updateCartBadge();
    openCartModal(); 
}

function removeFromCart(id) {
    cart = cart.filter(item => parseInt(item["@id"]) !== id);
    saveCartToStorage(); 
    updateCartBadge();
    openCartModal();
}

function syncCartWithFreshJson() {
    if (cart.length === 0) return;

    cart = cart.map(cartItem => {
        const freshProduct = allProducts.find(p => parseInt(p["@id"]) === parseInt(cartItem["@id"]));
        if (freshProduct) {
            return {
                ...cartItem,
                name: freshProduct.name,
                price: freshProduct.price,
                picture: freshProduct.picture,
                categoryId: freshProduct.categoryId
            };
        }
        return null; 
    }).filter(item => item !== null); 

    saveCartToStorage(); 
}

async function sendOrder(event) {
    event.preventDefault();

    const name = document.getElementById('clientName').value;
    const phone = document.getElementById('clientPhone').value;
    const delivery = document.getElementById('clientDelivery').value;
    const totalSum = document.getElementById('cartTotalDisplay').innerText;

    let itemsText = "";
    cart.forEach((item, index) => {
        const cost = parseFloat(item.price) * item.quantity;
        itemsText += `${index + 1}. ${item.name} — ${item.quantity} шт. (${cost} грн)\n`;
    });

    const message = `🛍️ **НОВЕ ЗАМОВЛЕННЯ З КОШИКА**\n\n` +
                    `📦 **Товари:**\n${itemsText}\n` +
                    `💰 **Загальна сума:** ${totalSum} грн\n\n` +
                    `👤 **Клієнт:** ${name}\n` +
                    `📞 **Телефон:** ${phone}\n` +
                    `🚚 **Доставка:** ${delivery}`;

    const submitBtn = document.getElementById('submitOrderBtn');
    submitBtn.disabled = true; 
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Надсилання...`;

    try {
        let response;
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (CLOUDFLARE_WORKER_URL && CLOUDFLARE_WORKER_URL !== "") {
            response = await fetch(CLOUDFLARE_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: message })
            });
        } else {
            const url = `https://telegram.org{TG_TOKEN}/sendMessage`;
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' })
            });
        }

        if (response.ok) {
            cart = []; 
            localStorage.removeItem('dropshop_cart');
            updateCartBadge();
            document.getElementById('orderForm').reset();
            cartModal.hide();
            setTimeout(() => { successModal.show(); }, 400);
        } else {
            alert('Помилка відправки замовлення. Перевірте налаштування бота чи Cloudflare.');
        }
    } catch (error) {
        alert('Помилка мережі. Не вдалося зв’язатися з сервером.');
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Оформити замовлення";
    }
}
