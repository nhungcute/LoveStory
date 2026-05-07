// --------------------------------------------------------------------------
// IMAGE GRID LAYOUTS
// --------------------------------------------------------------------------
function buildImageGrid(images, postId, layout) {
    if (images.length === 0) return '';

    if (!document.getElementById('layout-scroll-style')) {
        const style = document.createElement('style');
        style.id = 'layout-scroll-style';
        style.textContent = '.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }';
        document.head.appendChild(style);
    }

    if (images.length === 1) {
        return `<div class="d-flex justify-content-center w-100">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded')}</div>`;
    }

    if (layout === 'grid') {
        if (images.length === 2) {
            return `<div class="d-flex w-100" style="gap: 2px;">
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded-start')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover rounded-end')}</div>
            </div>`;
        }
        if (images.length === 3) {
            return `<div class="d-flex w-100" style="gap: 2px;">
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded-start')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[2], postId, 2, 'w-100 h-100 object-fit-cover rounded-end')}</div>
            </div>`;
        }
        if (images.length === 4) {
            return `<div class="d-flex flex-wrap w-100 rounded overflow-hidden" style="gap: 2px;">
                ${images.map((img, i) => `<div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1;">${imgTag(img, postId, i, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>`;
        }
        // > 4 images: grid 2x2 with +N overlay
        const firstThree = images.slice(0, 3);
        const fourth = images[3];
        const extraCount = images.length - 4;
        return `<div class="d-flex flex-wrap w-100 rounded overflow-hidden" style="gap: 2px;">
            ${firstThree.map((img, i) => `<div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1;">${imgTag(img, postId, i, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            <div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1; position: relative; cursor: pointer;">
                ${imgTag(fourth, postId, 3, 'w-100 h-100 object-fit-cover')}
                <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.5); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; pointer-events: none;">
                    +${extraCount}
                </div>
            </div>
        </div>`;
    }
    if (layout === 'top-bottom') {
        const rest = images.slice(1);
        return `<div class="d-flex flex-column w-100 rounded overflow-hidden" style="gap: 2px;">
            <div style="width: 100%; aspect-ratio: 16/9;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}</div>
            <div class="d-flex w-100 hide-scrollbar" style="gap: 2px; overflow-x: auto; scroll-snap-type: x mandatory;">
                ${rest.map((img, i) => `<div style="flex: ${rest.length >= 3 ? '0 0 calc(33.333% - 1.34px)' : '1'}; scroll-snap-align: start; aspect-ratio: 1/1;">${imgTag(img, postId, i + 1, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>
        </div>`;
    }
    if (layout === 'left-right') {
        const rest = images.slice(1);
        return `<div class="d-flex w-100 rounded overflow-hidden" style="gap: 2px; aspect-ratio: 4/5;">
            <div style="width: calc(50% - 1px); height: 100%;">
                ${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}
            </div>
            <div class="d-flex flex-column hide-scrollbar" style="width: calc(50% - 1px); gap: 2px; height: 100%; overflow-y: auto; scroll-snap-type: y mandatory;">
                ${rest.map((img, i) => `<div style="flex: ${rest.length >= 3 ? '0 0 calc(33.333% - 1.34px)' : '1'}; scroll-snap-align: start;">${imgTag(img, postId, i + 1, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>
        </div>`;
    }

    // Default fallbacks for legacy posts
    if (images.length === 2) {
        return `<div class="d-flex w-100" style="gap:2px;">
            <div style="flex:1;min-width:0;aspect-ratio:1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}</div>
            <div style="flex:1;min-width:0;aspect-ratio:1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover')}</div>
        </div>`;
    }
    if (images.length === 3) {
        return `<div class="grid-three">
            <div class="grid-main">${imgTag(images[0], postId, 0)}</div>
            <div class="grid-side">${imgTag(images[1], postId, 1)}${imgTag(images[2], postId, 2)}</div>
        </div>`;
    }
    if (images.length === 4) {
        return `<div class="grid-four">${images.map((img, i) => imgTag(img, postId, i)).join('')}</div>`;
    }
    // 5+ images: mosaic
    const rest = images.slice(1);
    return `<div class="grid-mosaic">
        <div class="grid-mosaic-main">${imgTag(images[0], postId, 0)}</div>
        <div class="grid-mosaic-strip">${rest.map((img, i) => imgTag(img, postId, i + 1)).join('')}</div>
    </div>`;
}

function imgTag(imgObj, postId, index, customClass = 'grid-img') {
    const url = (typeof imgObj === 'string') ? imgObj : (imgObj.url ? imgObj.url : '');
    const viewerIndex = (typeof imgObj === 'object' && imgObj.__viewerIndex !== undefined) ? imgObj.__viewerIndex : index;
    const previewUrl = url.includes('lh3.googleusercontent.com')
        ? url.replace(/=s\d+$/, '=s600')
        : url;
    return `<img src="${previewUrl}" class="${customClass}" loading="lazy" style="object-fit:cover;"
                 onclick="openImageViewer('${postId}', ${viewerIndex})"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3C/svg%3E'">`;
}

function normalizePostMedia(post) {
    return parseJSON(post.imageURLs, []).map(item => {
        const mediaObj = item && typeof item === 'object' ? item : {};
        const url = (typeof item === 'string') ? item : (mediaObj.url || '');
        const explicitType = mediaObj.type || '';
        const type = explicitType || (url.match(/\.(mp4|webm|ogg)$/i) || url.includes('/preview') ? 'video' : 'image');
        return { original: item, url, type };
    }).filter(item => item.url);
}

function findMediaDisplayIndex(post, url, type, occurrence = 0) {
    const media = normalizePostMedia(post);
    let seen = 0;
    for (let i = 0; i < media.length; i++) {
        if (media[i].url === url && media[i].type === type) {
            if (seen === occurrence) return i;
            seen++;
        }
    }
    return 0;
}

// --------------------------------------------------------------------------
// IMAGE VIEWER MODAL
// --------------------------------------------------------------------------
function openImageViewer(postId, startIndex) {
    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;

    const mediaList = normalizePostMedia(post);

    const modalEl = document.getElementById('imageViewerModal');
    const container = document.getElementById('carousel-items-container');
    const counter = document.getElementById('viewerCounter');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const carouselEl = document.getElementById('postImageCarousel');
    if (!modalEl || !container || mediaList.length === 0) return;
    const activeIndex = Math.min(Math.max(startIndex || 0, 0), mediaList.length - 1);

    container.innerHTML = mediaList.map((item, idx) => {
        const isActive = idx === activeIndex ? 'active' : '';
        let slideContent = '';
        if (item.type === 'video') {
            const driveMatch = item.url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || item.url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
            if (item.url.includes('drive.google.com') && driveMatch) {
                const embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
                slideContent = `
                    <div class="d-flex justify-content-center align-items-center h-100 w-100 position-relative" style="background: black;">
                        <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen style="border: none; z-index: 1;"></iframe>
                        <div style="position: absolute; top: 0; left: 0; right: 0; height: 56px; background: black; z-index: 2; pointer-events: none;"></div>
                    </div>`;
            } else {
                slideContent = `
                    <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                        <video src="${item.url}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" controls autoplay playsinline></video>
                    </div>`;
            }
        } else {
            const hdUrl = item.url.replace(/=s\d+$/, '=s0');
            slideContent = `
                <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                    <img src="${hdUrl}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="">
                </div>`;
        }
        return `<div class="carousel-item h-100 ${isActive}">${slideContent}</div>`;
    }).join('');

    const showNav = mediaList.length > 1;
    prevBtn.style.display = showNav ? '' : 'none';
    nextBtn.style.display = showNav ? '' : 'none';

    const updateCounter = () => {
        const activeIdx = [...container.querySelectorAll('.carousel-item')].findIndex(el => el.classList.contains('active'));
        counter.textContent = `${activeIdx + 1} / ${mediaList.length}`;
    };
    updateCounter();
    const onSlide = () => setTimeout(updateCounter, 50);
    carouselEl?.addEventListener('slide.bs.carousel', onSlide);
    modalEl.addEventListener('hidden.bs.modal', () => {
        carouselEl?.removeEventListener('slide.bs.carousel', onSlide);
        container.innerHTML = '';
    }, { once: true });

    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    if (activeIndex > 0) {
        setTimeout(() => {
            const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
            carousel.to(activeIndex);
        }, 50);
    }
}
