let map; // Define map globally

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize map (Shanghai coordinates)
    map = L.map('map').setView([31.2304, 121.4737], 12); // Centered on Shanghai, adjusted zoom for better view

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const tourismData = await loadShanghaiDataFromJSON();
    if (tourismData.length > 0) {
        initializeMapWithData(tourismData);
    }
});

function showLoadingSpinner(message) {
    const spinner = document.getElementById('loading-spinner');
    spinner.querySelector('p').textContent = message;
    spinner.style.display = 'flex';
}

function hideLoadingSpinner() {
    document.getElementById('loading-spinner').style.display = 'none';
}

function showFloatingMessage(message, type, duration = 3000) {
    const msgElem = document.getElementById('floating-message');
    msgElem.textContent = message;
    msgElem.className = `floating-message ${type} show`;
    msgElem.style.display = 'block';

    setTimeout(() => {
        msgElem.classList.remove('show');
        setTimeout(() => msgElem.style.display = 'none', 500); // Wait for fade out
    }, duration);
}

async function loadShanghaiDataFromJSON() {
    try {
        showLoadingSpinner('상해 여행 데이터를 불러오는 중...');

        const response = await fetch('./data/shanghai-data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        hideLoadingSpinner();
        showFloatingMessage(`✅ 상해 여행 데이터 ${data.length}개를 성공적으로 로드했습니다!`, 'success', 4000);
        return data;

    } catch (error) {
        hideLoadingSpinner();
        console.error('상해 여행 데이터 로드 실패:', error);
        showFloatingMessage('⚠️ 상해 여행 데이터 로드에 실패했습니다. 파일을 확인해 주세요.', 'error', 5000);
        return [];
    }
}

function initializeMapWithData(data) {
    data.forEach(item => {
        if (item.lat && item.lon) {
            let iconClass = '';
            let iconHtml = '';

            if (item.type === 'tourist') {
                iconClass = 'tourist-spot';
                iconHtml = '<i class="fas fa-camera"></i>'; // Camera icon for tourist spots
            } else if (item.type === 'restaurant') {
                iconClass = 'restaurant';
                iconHtml = '<i class="fas fa-utensils"></i>'; // Utensils icon for restaurants
            } else if (item.type === 'airport') {
                iconClass = 'airport';
                iconHtml = '<i class="fas fa-plane"></i>'; // Plane icon for airport
            } else if (item.type === 'accommodation') { // NEW: Accommodation type
                iconClass = 'accommodation';
                iconHtml = '<i class="fas fa-hotel"></i>'; // Hotel icon for accommodation
            }

            // Marker icon size and anchor adjusted to 20px (visually 8px 느낌)
            const customIcon = L.divIcon({
                className: `leaflet-div-icon ${iconClass}`,
                html: iconHtml,
                iconSize: [20, 20], // Adjusted size for better visual balance with smaller icons
                iconAnchor: [10, 10] // Center the icon (half of iconSize)
            });

            let popupContent = `<h4>${item.name}</h4>`;
            if (item.feature) {
                popupContent += `<p><strong>특징:</strong> ${item.feature}</p>`;
            }
            if (item.menu) {
                popupContent += `<p><strong>주요 메뉴:</strong> ${item.menu}</p>`;
            }
            popupContent += `<p>(${item.lat}, ${item.lon})</p>`;

            const marker = L.marker([item.lat, item.lon], { icon: customIcon })
                .addTo(map)
                .bindPopup(popupContent);

            // Add label directly to the marker
            const label = L.marker([item.lat, item.lon], {
                icon: L.divIcon({
                    className: 'leaflet-marker-label',
                    html: `<span>${item.name}</span>`,
                }),
                interactive: false // Make label non-interactive
            }).addTo(map);

        }
    });
}
