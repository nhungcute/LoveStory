/**
 * modal-ui-helpers.js
 * Bootstrap modal helpers, notification badge, confirm dialog, and Eruda dev tools toggle.
 */

function closeAllModals() {
    const openModals = document.querySelectorAll('.modal.show');
    openModals.forEach(modalEl => {
        const instance = bootstrap.Modal.getInstance(modalEl);
        if (instance) instance.hide();
    });
}

function openModal(modalId) {
    closeAllModals();
    const el = document.getElementById(modalId);
    if (el) bootstrap.Modal.getOrCreateInstance(el).show();
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    state.unreadCount = count;
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('visible', count > 0);
}

function confirmAction(title, message, callback) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').textContent = message;
    const btn = document.getElementById('btnConfirmAction');

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.onclick = () => {
        bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
        callback();
    };
    openModal('confirmModal');
}

function toggleEruda(enabled) {
    if (enabled) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/eruda@3/eruda.min.js';
        script.onload = () => eruda.init();
        document.body.appendChild(script);
    }
}
