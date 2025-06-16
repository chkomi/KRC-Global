// Global Variables
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // Array to store all marker data including label visibility
let currentLocationMarker = null; // Current location marker
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};

// Map marker background colors for dynamic label border
const markerColors = {
    attractions: '#ea4335',
    restaurants: '#34a853',
    airports: '#9b59b6',
    hotels: '#1a73e8'
};


// Initialize on document load
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
});

// Function to load data
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('Data loaded successfully:', shanghaiData);
    } catch (error) {
        console.error('Failed to load data:', error);
        // Initialize with empty data on failure
        shanghaiData = {
            shanghai_tourism: {
                attractions: [],
                restaurants: [],
                hotels: [],
                airports: []
            }
        };
    }
}

// Function to extract Korean text
function extractKorean(text) {
    // 괄호 안의 한글 부분을 먼저 찾기
    const koreanInParentheses = text.match(/\(([가-힣\s]+)\)/);
    if (koreanInParentheses && koreanInParentheses[1].trim() !== '') {
        return koreanInParentheses[1].trim();
    }

    // 괄호가 없다면 전체 텍스트에서 한글 부분 추출
    const koreanParts = text.match(/[가-힣\s]+/g);
    if (koreanParts && koreanParts.length > 0) {
        // 비어있는 문자열 필터링 후 첫 번째 비어있지 않은 한글 부분 반환
        const filteredParts = koreanParts.filter(part => part.trim() !== '');
        if (filteredParts.length > 0) {
            return filteredParts[0].trim();
        }
    }

    // 한글이 없다면 원본 텍스트 반환
    return text;
}

// Map Initialization Function
function initializeMap() {
    // 지도 초기화 (상하이 중심)
    map = L.map('map').setView([31.2304, 121.4737], 12);

    // 다양한 타일 레이어 정의
    const tileLayers = {
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }),
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
            maxZoom: 19
        })
    };

    // 기본 심플 타일 레이어 추가
    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    // 타일 레이어 변경 이벤트 리스너
    document.querySelectorAll('input[name="tile-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                map.removeLayer(currentTileLayer);
                currentTileLayer = tileLayers[this.value];
                currentTileLayer.addTo(map);

                document.querySelectorAll('.tile-option').forEach(option => {
                    option.classList.remove('active');
                });
                this.parentElement.classList.add('active');
            }
        });
    });

    // 마커 그룹들을 지도에 추가
    Object.values(markerGroups).forEach(group => {
        group.addTo(map);
    });

    // 마커 표시
    displayMarkers();

    // 줌 레벨 변경 시 라벨 가시성 업데이트
    map.on('zoomend', () => {
        updateLabelVisibility();
    });

    // 지도 로드 후 초기 라벨 가시성 설정
    map.whenReady(() => {
        updateLabelVisibility();
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // ESC 키로 정보 박스 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    // 지도 클릭 시 정보 박스 닫기
    map.on('click', (e) => {
        // 클릭 대상이 직접 지도 컨테이너인지 확인 (마커나 팝업 등이 아닌 경우)
        if (e.originalEvent && e.originalEvent.target === map.getContainer()) {
            closeInfoBox();
        }
    });

    // 범례 체크박스 이벤트 리스너
    document.getElementById('attractions-toggle').addEventListener('change', function() {
        toggleMarkerGroup('attractions', this.checked);
    });
    document.getElementById('restaurants-toggle').addEventListener('change', function() {
        toggleMarkerGroup('restaurants', this.checked);
    });
    document.getElementById('hotels-toggle').addEventListener('change', function() {
        toggleMarkerGroup('hotels', this.checked);
    });
    document.getElementById('airports-toggle').addEventListener('change', function() {
        toggleMarkerGroup('airports', this.checked);
    });

    // 위치 찾기 버튼 이벤트 리스너
    document.getElementById('locate-btn').addEventListener('click', function() {
        findMyLocation();
    });
}

// 마커 그룹 토글 함수
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }

    // 그룹 가시성 변경 후 라벨 가시성 업데이트
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('마커를 표시할 데이터가 없습니다.');
        return;
    }

    // 기존 마커들 제거
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // 모든 장소 데이터 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            allPlaces.push({...place, type: type});
        });
    });

    // 위치별로 장소들을 그룹화
    const locationGroups = {};

    allPlaces.forEach(place => {
        // 부동 소수점 문제 방지를 위해 정밀도를 고정하여 그룹화
        const lat = parseFloat(place.latitude).toFixed(4);
        const lng = parseFloat(place.longitude).toFixed(4);
        const locationKey = `${lat},${lng}`;

        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: place.latitude,
                longitude: place.longitude,
                places: []
            };
        }
        locationGroups[locationKey].places.push(place);
    });

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach(group => {
        // 우선순위가 높은 타입으로 마커 아이콘 결정 (예: 공항 > 관광지 > 호텔 > 음식점)
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) =>
            (priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr)
        ).type;

        // 마커 생성
        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType)
        }).addTo(markerGroups[mainType]);

        // 라벨 텍스트 생성 (한글만 추출)
        let labelText;
        if (group.places.length === 1) {
            labelText = extractKorean(group.places[0].name);
        } else {
            const firstPlaceName = extractKorean(group.places[0].name);
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        // 클릭 이벤트로 그룹 상세 정보 표시
        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15); // 클릭 시 확대
        });

        // 툴팁(라벨)을 마커 하단에 바인딩하고 동적으로 스타일 적용
        const tooltip = marker.bindTooltip(labelText, {
            permanent: true,
            direction: 'bottom', // 라벨을 마커 하단에 배치
            offset: [0, 15], // 마커 중앙에서 아래로 15px 이동
            className: 'leaflet-tooltip', // 새로운 라벨 디자인 클래스 사용
            opacity: 0 // 초기에는 투명하게 설정 (CSS transition으로 나타남)
        }).getTooltip();

        // 툴팁의 왼쪽 테두리 색상을 마커의 색상과 동일하게 설정
        tooltip.getElement().style.borderLeft = `4px solid ${markerColors[mainType] || '#3498db'}`;


        // 가시성 제어를 위해 마커 정보 저장
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            group: group,
            labelVisible: false, // 초기 라벨 가시성 상태
            groupType: mainType
        });
    });

    // 모든 마커가 보이도록 지도 뷰 조정
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });

    if (allMarkersLayer.getLayers().length > 0) {
        map.fitBounds(allMarkersLayer.getBounds().pad(0.1));
    }

    // 초기 라벨 가시성 설정 (지도 로드 완료 후 실행)
    // 이 부분은 map.whenReady() 에서 호출되도록 했습니다.
}

// 내 위치 찾기 함수
function findMyLocation() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    // 로딩 상태로 변경
    icon.className = 'fas fa-spinner fa-spin';
    locateBtn.disabled = true;

    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 서비스가 지원되지 않습니다.');
        resetLocateButton();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // 지도를 현재 위치로 이동
            map.setView([lat, lng], 15);

            // 기존 현재 위치 마커 제거
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }

            // 현재 위치 마커 생성
            currentLocationMarker = L.marker([lat, lng], {
                icon: createCurrentLocationIcon()
            }).addTo(map);

            const currentLocationTooltip = currentLocationMarker.bindTooltip('현재 위치', {
                permanent: false,
                direction: 'top',
                offset: [0, -25],
                className: 'leaflet-tooltip current-location-label' // 새로운 라벨 클래스 사용
            }).openTooltip(); // 현재 위치 툴팁은 즉시 보이도록

            // 현재 위치 라벨 테두리 색상 설정
            currentLocationTooltip.getElement().style.borderLeft = `4px solid #1a73e8`;

            resetLocateButton();
        },
        function(error) {
            let errorMessage = '위치를 찾을 수 없습니다.';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '위치 접근이 거부되었습니다.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '위치 요청 시간이 초과되었습니다.';
                    break;
            }
            alert(errorMessage);
            resetLocateButton();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

// 위치 버튼 리셋
function resetLocateButton() {
    const locateBtn = document.getElementById('locate-btn');
    const icon = locateBtn.querySelector('i');

    icon.className = 'fas fa-location-crosshairs';
    locateBtn.disabled = false;
}

// 현재 위치 아이콘 생성
function createCurrentLocationIcon() {
    return L.divIcon({
        className: 'current-location-marker',
        html: `<div class="location-pulse">
                 <div class="location-dot"></div>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// 줌 및 그룹 가시성에 따라 라벨 가시성 업데이트
function updateLabelVisibility() {
    const currentZoom = map.getZoom();

    // 라벨이 나타나기 시작할 최소 줌 레벨을 설정합니다.
    // 이 값은 데이터 밀도와 마커 겹침 정도에 따라 조정해야 합니다.
    const minZoomForLabels = 15; // 줌 레벨 15 이상에서 라벨 표시

    allMarkers.forEach(markerData => {
        const isGroupVisible = map.hasLayer(markerGroups[markerData.groupType]);
        const tooltipElement = markerData.marker.getTooltip().getElement();

        // 현재 줌 레벨이 라벨 표시 최소 줌 레벨 이상이고, 해당 그룹이 보이는 상태일 때
        if (currentZoom >= minZoomForLabels && isGroupVisible) {
            if (!markerData.labelVisible) {
                // 라벨이 보이도록 CSS 클래스 추가
                tooltipElement.classList.add('show-label');
                markerData.labelVisible = true;
            }
        } else {
            // 라벨 숨기기
            if (markerData.labelVisible) {
                // 라벨이 숨겨지도록 CSS 클래스 제거
                tooltipElement.classList.remove('show-label');
                markerData.labelVisible = false;
            }
        }
    });
}

// 커스텀 아이콘 생성 함수 (원형 마커)
function createCustomIcon(type) {
    let iconClass, bgClass;

    switch (type) {
        case 'attractions':
            iconClass = 'fas fa-camera';
            bgClass = 'tourism-bg';
            break;
        case 'restaurants':
            iconClass = 'fas fa-utensils';
            bgClass = 'restaurant-bg';
            break;
        case 'airports':
            iconClass = 'fas fa-plane';
            bgClass = 'airport-bg';
            break;
        case 'hotels':
            iconClass = 'fas fa-bed';
            bgClass = 'accommodation-bg';
            break;
        default:
            iconClass = 'fas fa-map-marker-alt';
            bgClass = 'tourism-bg';
    }

    return L.divIcon({
        className: 'google-circle-marker',
        html: `<div class="circle-marker ${bgClass}">
                 <i class="${iconClass}"></i>
               </div>`,
        iconSize: [18, 18], // 마커 크기 24px * 0.75 = 18px
        iconAnchor: [9, 9] // 중앙 기준 18px / 2 = 9px
    });
}

// 그룹 상세 정보 표시 함수
function displayGroupDetails(group) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');

    let detailsHtml = '';

    if (group.places.length === 1) {
        // 단일 장소
        const place = group.places[0];
        detailsHtml = `
            <div class="place-type-badge type-${place.type}">
                ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
            </div>
            <h3><i class="fas fa-map-marker-alt"></i> ${place.name}</h3>
        `;

        if (place.description) {
            detailsHtml += `<p><strong>🎯 설명:</strong> ${place.description}</p>`;
        }

        if (place.address && place.address !== "N/A") {
            detailsHtml += `<p><strong>📍 주소:</strong> ${place.address}</p>`;
        }

        if (place.features && place.features.length > 0) {
            detailsHtml += `<p><strong>✨ 특징:</strong> ${place.features.join(', ')}</p>`;
        }

        if (place.menu && place.menu.length > 0) {
            detailsHtml += `<p><strong>🍽️ 메뉴:</strong></p><ul>`;
            place.menu.forEach(item => {
                detailsHtml += `<li>${item}</li>`;
            });
            detailsHtml += `</ul>`;
        }

        // 지도 연결 버튼
        detailsHtml += `
            <div class="map-links">
                <h4><i class="fas fa-external-link-alt"></i> 외부 지도에서 보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${place.address}', ${place.latitude}, ${place.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${place.address}', ${place.latitude}, ${place.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    } else {
        // 여러 장소 그룹
        detailsHtml = `
            <div class="group-header">
                <h3>
                    <i class="fas fa-map-marker-alt"></i>
                    이 위치의 장소들
                    <span class="place-count-badge">${group.places.length}곳</span>
                </h3>
            </div>
        `;

        group.places.forEach((place, index) => {
            detailsHtml += `
                <div class="place-group-item type-${place.type}">
                    <div class="place-type-badge type-${place.type}">
                        ${getTypeIcon(place.type)} ${getTypeDisplayName(place.type)}
                    </div>
                    <h4>${place.name}</h4>
            `;

            if (place.description) {
                detailsHtml += `<p><strong>설명:</strong> ${place.description}</p>`;
            }

            if (place.address && place.address !== "N/A") {
                detailsHtml += `<p><strong>주소:</strong> ${place.address}</p>`;
            }

            if (place.features && place.features.length > 0) {
                detailsHtml += `<p><strong>특징:</strong> ${place.features.join(', ')}</p>`;
            }

            if (place.menu && place.menu.length > 0) {
                detailsHtml += `<p><strong>메뉴:</strong> ${place.menu.join(', ')}</p>`;
            }

            // 개별 지도 연결 버튼
            detailsHtml += `
                <div class="place-map-buttons">
                    <button class="map-btn-small google-btn" onclick="openGoogleMaps('${place.address}', ${place.latitude}, ${place.longitude})" title="구글지도에서 ${place.name} 검색">
                        <i class="fab fa-google"></i>
                    </button>
                    <button class="map-btn-small amap-btn" onclick="openAmapSearch('${place.address}', ${place.latitude}, ${place.longitude})" title="가오더지도에서 ${place.name} 검색">
                        <i class="fas fa-map"></i>
                    </button>
                </div>
            `;

            detailsHtml += `</div>`;

            if (index < group.places.length - 1) {
                detailsHtml += `<div class="place-separator"></div>`;
            }
        });

        // 그룹 전체 지도 연결 버튼
        const firstPlace = group.places[0];
        detailsHtml += `
            <div class="group-map-links">
                <h4><i class="fas fa-external-link-alt"></i> 이 위치 전체보기</h4>
                <div class="map-buttons">
                    <button class="map-btn google-btn" onclick="openGoogleMaps('${firstPlace.address}', ${group.latitude}, ${group.longitude})">
                        <i class="fab fa-google"></i> 구글지도
                    </button>
                    <button class="map-btn amap-btn" onclick="openAmapSearch('${firstPlace.address}', ${group.latitude}, ${group.longitude})">
                        <i class="fas fa-map"></i> 가오더지도
                    </button>
                </div>
            </div>
        `;
    }

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
}

// 구글지도 열기 함수 (주소 기반)
function openGoogleMaps(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // 정확한 위치와 함께 주소를 쿼리로 사용
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress},${lat},${lng}`;
    window.open(googleMapsUrl, '_blank');
}

// 가오더지도 열기 함수 (주소 기반)
function openAmapSearch(address, lat, lng) {
    const encodedAddress = encodeURIComponent(address);
    // 도시와 쿼리를 포함한 검색 URL
    const amapUrl = `https://ditu.amap.com/search?query=${encodedAddress}&city=上海&geoobj=${lng}|${lat}|${lng}|${lat}&zoom=17`;
    window.open(amapUrl, '_blank');
}

// 정보 박스 닫기 함수
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show');
}

// 타입별 아이콘 반환 함수
function getTypeIcon(type) {
    switch (type) {
        case 'attractions': return '📷';
        case 'restaurants': return '🍴';
        case 'airports': return '✈️';
        case 'hotels': return '🏨';
        default: return '📍';
    }
}

// 타입별 한국어 이름 반환 함수
function getTypeDisplayName(type) {
    switch (type) {
        case 'attractions': return '관광지';
        case 'restaurants': return '음식점';
        case 'airports': return '공항';
        case 'hotels': return '호텔';
        default: return '기타';
    }
}
