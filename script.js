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
        // 기존 공항/숙소 데이터 구조와 새로운 데이터 구조를 모두 처리
        const itemName = item.장소명 || item.name;
        const itemType = item.카테고리 || item.type; // '카테고리' 또는 'type' 사용
        const itemLat = item.위도 || item.lat;
        const itemLon = item.경도 || item.lon;
        const itemFeature = item['특징 및 설명'] || item.feature;
        const itemMenu = item['주요 메뉴'] || item.menu; // 기존 맛집 데이터에서 사용
        const itemAddress = item.주소;
        const itemVisitDay = item.추천_방문일차; // 필드명 수정 (공백 제거)
        const itemRating = item.평점;
        const itemOpeningHours = item.영업시간;
        const itemPhone = item.전화번호;


        if (itemLat && itemLon) {
            let iconClass = '';
            let iconHtml = '';

            if (itemType === '관광지') {
                iconClass = 'tourist-spot';
                iconHtml = '<i class="fas fa-camera"></i>'; // Camera icon for tourist spots
            } else if (itemType === '맛집') {
                iconClass = 'restaurant';
                iconHtml = '<i class="fas fa-utensils"></i>'; // Utensils icon for restaurants
            } else if (itemType === 'airport') { // 기존 공항 데이터 타입
                iconClass = 'airport';
                iconHtml = '<i class="fas fa-plane"></i>'; // Plane icon for airport
            } else if (itemType === 'accommodation') { // 기존 숙소 데이터 타입
                iconClass = 'accommodation';
                iconHtml = '<i class="fas fa-hotel"></i>'; // Hotel icon for accommodation
            }

            const customIcon = L.divIcon({
                className: `leaflet-div-icon ${iconClass}`,
                html: iconHtml,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            // Populate popup content based on new data structure
            let popupContent = `<h4>${itemName}</h4>`;
            if (itemType === '관광지' || itemType === 'airport' || itemType === 'accommodation') {
                if (itemFeature) {
                    popupContent += `<p><strong>특징:</strong> ${itemFeature}</p>`;
                }
            } else if (itemType === '맛집') {
                if (itemFeature) { // 맛집의 경우에도 '특징 및 설명' 사용
                    popupContent += `<p><strong>설명:</strong> ${itemFeature}</p>`;
                } else if (itemMenu) { // 기존 맛집 데이터의 '주요 메뉴' 호환성
                    popupContent += `<p><strong>주요 메뉴:</strong> ${itemMenu}</p>`;
                }
            }

            if (itemAddress) {
                popupContent += `<p><strong>주소:</strong> ${itemAddress}</p>`;
            }
            if (itemVisitDay) {
                popupContent += `<p><strong>추천 방문 일차:</strong> ${itemVisitDay}</p>`;
            }
            if (itemRating) {
                popupContent += `<p><strong>평점:</strong> ${itemRating} / 5</p>`;
            }
            if (itemOpeningHours) {
                popupContent += `<p><strong>영업시간:</strong> ${itemOpeningHours}</p>`;
            }
            if (itemPhone) {
                popupContent += `<p><strong>전화번호:</strong> ${itemPhone}</p>`;
            }
            popupContent += `<p>(${itemLat}, ${itemLon})</p>`;


            const marker = L.marker([itemLat, itemLon], { icon: customIcon })
                .addTo(map)
                .bindPopup(popupContent);

            const label = L.marker([itemLat, itemLon], {
                icon: L.divIcon({
                    className: 'leaflet-marker-label',
                    html: `<span>${itemName}</span>`,
                }),
                interactive: false
            }).addTo(map);

        }
    });
}
