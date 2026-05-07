function showConfirm(message, title = 'Xác nhận') {
    return new Promise(resolve => {
        const modalEl = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const bodyEl = document.getElementById('confirmModalBody');
        const confirmBtn = document.getElementById('btnConfirmAction');

        if (!modalEl || !confirmBtn) {
            resolve(window.confirm(message));
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = message;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        let resolved = false;
        const onConfirm = () => {
            resolved = true;
            modal.hide();
            resolve(true);
        };
        const onHide = () => {
            modalEl.removeEventListener('hidden.bs.modal', onHide);
            if (!resolved) resolve(false);
        };

        newBtn.addEventListener('click', onConfirm, { once: true });
        modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });

        modal.show();
    });
}

function showAlert(message, title = 'Thông báo') {
    return new Promise(resolve => {
        const modalEl = document.getElementById('alertModal');
        const titleEl = document.getElementById('alertModalTitle');
        const bodyEl = document.getElementById('alertModalBody');

        if (!modalEl) {
            window.alert(message);
            resolve();
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = message;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const onHide = () => {
            modalEl.removeEventListener('hidden.bs.modal', onHide);
            resolve();
        };

        modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });
        modal.show();
    });
}
