// 전역 변수
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커를 저장할 배열

// 문서 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
});

// 데이터 로드 함수
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('데이터 로드 완료:', shanghaiData);
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        // 로드 실패 시 빈 데이터로 초기화
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

// 지도 초기화 함수
function initializeMap() {
    // 지도 초기화 (상하이 중심)
    map = L.map('map').setView([31.2304, 121.4737], 12);

    // 다양한 타일 레이어 정의
    const tileLayers = {
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
            maxZoom: 19
        }),
        'google-style': L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://www.openstreetmap.fr/">OSM France</a>',
            maxZoom: 20,
            subdomains: ['a', 'b', 'c']
        }),
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        })
    };

    // 기본 도로 타일 레이어 추가
    currentTileLayer = tileLayers.street;
    currentTileLayer.addTo(map);

    // 타일 레이어 변경 이벤트 리스너
    document.querySelectorAll('input[name="tile-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.checked) {
                // 기존 타일 레이어 제거
                map.removeLayer(currentTileLayer);
                
                // 새 타일 레이어 추가
                currentTileLayer = tileLayers[this.value];
                currentTileLayer.addTo(map);
                
                // 활성 상태 업데이트
                document.querySelectorAll('.tile-option').forEach(option => {
                    option.classList.remove('active');
                });
                this.parentElement.classList.add('active');
            }
        });
    });

    // 마커 레이어 그룹을 지도에 추가
    markers.addTo(map);

    // 마커 표시
    displayMarkers();

    // 줌 레벨 변경 시 라벨 가시성 업데이트
    map.on('zoomend moveend', () => {
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
        // 마커가 아닌 지도 영역을 클릭했을 때만 정보 박스 닫기
        if (e.originalEvent && e.originalEvent.target === e.originalEvent.currentTarget) {
            closeInfoBox();
        }
    });
}

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('데이터가 없습니다.');
        return;
    }

    markers.clearLayers();
    allMarkers = []; // 마커 배열 초기화

    // 모든 장소 데이터를 하나의 배열로 합치기
    const allPlaces = [
        ...shanghaiData.shanghai_tourism.attractions.map(place => ({...place, type: 'attractions'})),
        ...shanghaiData.shanghai_tourism.restaurants.map(place => ({...place, type: 'restaurants'})),
        ...shanghaiData.shanghai_tourism.hotels.map(place => ({...place, type: 'hotels'})),
        ...shanghaiData.shanghai_tourism.airports.map(place => ({...place, type: 'airports'}))
    ];

    allPlaces.forEach((place, index) => {
        const marker = L.marker([place.latitude, place.longitude], {
            icon: createCustomIcon(place.type)
        }).addTo(markers);

        // 다양한 방향으로 라벨 위치 설정
        const directions = ['top', 'bottom', 'right', 'left', 'topright', 'topleft', 'bottomright', 'bottomleft'];
        const direction = directions[index % directions.length];
        
        const tooltip = marker.bindTooltip(place.name, {
            permanent: false, // 기본적으로 숨김
            direction: direction,
            offset: getTooltipOffset(direction),
            className: 'place-label'
        });

        marker.on('click', () => {
            displayPlaceDetails(place);
            map.flyTo([place.latitude, place.longitude], 15);
        });

        // 마커 정보를 배열에 저장
        allMarkers.push({
            marker: marker,
            tooltip: tooltip,
            place: place,
            direction: direction,
            visible: false
        });
    });

    // 모든 마커가 보이도록 지도 뷰 조정
    if (markers.getLayers().length > 0) {
        map.fitBounds(markers.getBounds().pad(0.1));
    }

    // 초기 라벨 가시성 설정
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 툴팁 오프셋 계산 함수
function getTooltipOffset(direction) {
    const baseOffset = 25;
    switch (direction) {
        case 'top': return [0, -baseOffset];
        case 'bottom': return [0, baseOffset];
        case 'right': return [baseOffset, 0];
        case 'left': return [-baseOffset, 0];
        case 'topright': return [baseOffset, -baseOffset];
        case 'topleft': return [-baseOffset, -baseOffset];
        case 'bottomright': return [baseOffset, baseOffset];
        case 'bottomleft': return [-baseOffset, baseOffset];
        default: return [baseOffset, 0];
    }
}

// 라벨 가시성 업데이트 함수
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    
    // 현재 뷰에 있는 마커들만 필터링
    const visibleMarkers = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        return bounds.contains(latLng);
    });

    // 모든 라벨 숨기기
    allMarkers.forEach(markerData => {
        if (markerData.visible) {
            markerData.tooltip.removeFrom(map);
            markerData.visible = false;
        }
    });

    // 줌 레벨에 따른 최소 거리 설정
    let minDistance;
    if (currentZoom >= 15) {
        minDistance = 30; // 높은 줌에서는 가까운 거리 허용
    } else if (currentZoom >= 13) {
        minDistance = 50;
    } else if (currentZoom >= 11) {
        minDistance = 80;
    } else {
        minDistance = 120; // 낮은 줌에서는 먼 거리만 허용
    }

    // 우선순위에 따라 정렬 (공항 > 관광지 > 호텔 > 음식점)
    const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
    visibleMarkers.sort((a, b) => {
        const priorityA = priorityOrder[a.place.type] || 5;
        const priorityB = priorityOrder[b.place.type] || 5;
        return priorityA - priorityB;
    });

    const displayedPositions = [];

    visibleMarkers.forEach(markerData => {
        const markerPos = map.latLngToContainerPoint(markerData.marker.getLatLng());
        
        // 라벨 위치 계산
        const offset = getTooltipOffset(markerData.direction);
        const labelPos = {
            x: markerPos.x + offset[0],
            y: markerPos.y + offset[1]
        };

        // 다른 라벨들과의 거리 체크
        let canDisplay = true;
        for (const displayedPos of displayedPositions) {
            const distance = Math.sqrt(
                Math.pow(labelPos.x - displayedPos.x, 2) + 
                Math.pow(labelPos.y - displayedPos.y, 2)
            );
            
            if (distance < minDistance) {
                canDisplay = false;
                break;
            }
        }

        // 화면 경계 체크
        const mapSize = map.getSize();
        const labelWidth = markerData.place.name.length * 8; // 대략적인 라벨 너비
        const labelHeight = 20; // 대략적인 라벨 높이
        
        if (labelPos.x - labelWidth/2 < 0 || 
            labelPos.x + labelWidth/2 > mapSize.x ||
            labelPos.y - labelHeight/2 < 0 || 
            labelPos.y + labelHeight/2 > mapSize.y) {
            canDisplay = false;
        }

        if (canDisplay) {
            markerData.tooltip.addTo(map);
            markerData.visible = true;
            displayedPositions.push(labelPos);
        }
    });
}

// 커스텀 아이콘 생성 함수
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
        className: 'custom-marker-icon',
        html: `<div class="marker-content ${bgClass}">
                 <i class="${iconClass}"></i>
               </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        tooltipAnchor: [0, -15]
    });
}

// 장소 상세 정보 표시 함수
function displayPlaceDetails(place) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');
    
    let detailsHtml = `
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

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
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