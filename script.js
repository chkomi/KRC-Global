// 전역 변수 (이전 코드와 동일)
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = [];
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};
let clickedMarkers = [];

// 경로 관련 전역 변수
let routePolyline = null;
let routeInfoControl = null;

// 문서 로드 완료 시 초기화 (이전 코드와 동일)
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
    drawRoute(); // 경로 그리기 함수 호출 추가
});

// 데이터 로드 함수 (이전 코드와 동일)
async function loadData() {
    try {
        const response = await fetch('data/shanghai-data.json');
        shanghaiData = await response.json();
        console.log('데이터 로드 완료:', shanghaiData);
    } catch (error) {
        console.error('데이터 로드 실패:', error);
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

// 지도 초기화 함수 (이전 코드와 거의 동일)
function initializeMap() {
    map = L.map('map').setView([31.2304, 121.4737], 12);

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

    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    console.log('기본 지도 타일:', 'cartodb');

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

    Object.values(markerGroups).forEach(group => {
        group.addTo(map);
    });

    displayMarkers();

    map.on('zoomend moveend', () => {
        updateLabelVisibility();
    });
}

// 이벤트 리스너 설정 (이전 코드와 동일)
function setupEventListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    map.on('click', (e) => {
        if (!e.originalEvent || !e.originalEvent.target || (!e.originalEvent.target.closest('.info-box') && !e.originalEvent.target.closest('.custom-marker-icon'))) {
             closeInfoBox();
        }
    });

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
}

// 마커 그룹 토글 함수 (이전 코드와 동일)
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 마커 표시 함수 (이전 코드와 거의 동일)
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('데이터가 없습니다.');
        return;
    }

    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    const locationsMap = new Map();

    ['attractions', 'restaurants', 'hotels', 'airports'].forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            const key = `${place.latitude},${place.longitude}`;
            if (!locationsMap.has(key)) {
                locationsMap.set(key, []);
            }
            locationsMap.get(key).push({...place, type: type});
        });
    });

    locationsMap.forEach((placesAtLocation, key) => {
        const representativePlace = placesAtLocation[0];
        const marker = L.marker([representativePlace.latitude, representativePlace.longitude], {
            icon: createCustomIcon(representativePlace.type)
        }).addTo(markerGroups[representativePlace.type]);

        const tooltip = L.tooltip({
            permanent: true,
            direction: 'bottom',
            offset: [0, 0],
            className: 'place-label',
            opacity: 0,
            interactive: false
        });

        marker.bindTooltip(tooltip);
        
        marker.on('click', () => {
            displayPlaceDetails(placesAtLocation);
            map.flyTo([representativePlace.latitude, representativePlace.longitude], 15);
        });

        allMarkers.push({
            marker: marker,
            tooltip: tooltip,
            places: placesAtLocation,
            representativePlace: representativePlace,
            group: representativePlace.type
        });
    });
    
    const allMarkersLayer = L.featureGroup();
    Object.values(markerGroups).forEach(group => {
        group.getLayers().forEach(layer => {
            allMarkersLayer.addLayer(layer);
        });
    });
    
    if (allMarkersLayer.getLayers().length > 0) {
        map.fitBounds(allMarkersLayer.getBounds().pad(0.1));
    }

    setTimeout(() => {
        updateLabelVisibility();
    }, 500);
}

// 라벨 가시성 및 배치 업데이트 함수 (수정됨)
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    const mapSize = map.getSize();

    // 1. 모든 라벨 숨기기
    allMarkers.forEach(markerData => {
        markerData.tooltip.setOpacity(0);
    });

    // 2. 특정 줌 레벨 이상에서만 라벨 표시
    const labelVisibleZoomLevel = 13;

    if (currentZoom < labelVisibleZoomLevel) {
        return;
    }

    // 3. 현재 지도 범위 내에 있는 마커 필터링
    let visibleMarkersInBounds = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        const isGroupVisible = markerGroups && markerGroups[markerData.group] && map.hasLayer(markerGroups[markerData.group]);
        return isInBounds && isGroupVisible;
    });

    // 4. 라벨 배치 우선순위 정렬 (이름 길이 기준)
    visibleMarkersInBounds.sort((a, b) => {
        return a.representativePlace.name.length - b.representativePlace.name.length;
    });

    const displayedLabelRects = [];

    // 5. 각 라벨에 대해 최적 위치 찾기 및 표시
    visibleMarkersInBounds.forEach(markerData => {
        const markerLatLng = markerData.marker.getLatLng();
        const markerPixel = map.latLngToContainerPoint(markerLatLng);

        const labelText = markerData.representativePlace.name;
        markerData.tooltip.setContent(labelText);

        const estimatedLabelWidth = labelText.length * 7 + 16;
        const estimatedLabelHeight = 22;

        const labelPlacementOptions = [
            { direction: 'bottom', xOffset: 0, yOffset: 9 + estimatedLabelHeight / 2 + 5 },
            { direction: 'right', xOffset: 9 + estimatedLabelWidth / 2 + 5, yOffset: 0 },
            { direction: 'left', xOffset: -(9 + estimatedLabelWidth / 2 + 5), yOffset: 0 },
            { direction: 'top', xOffset: 0, yOffset: -(9 + estimatedLabelHeight / 2 + 5) },
            { direction: 'bottomright', xOffset: 9 + estimatedLabelWidth / 4 + 5, yOffset: 9 + estimatedLabelHeight / 4 + 5 },
            { direction: 'bottomleft', xOffset: -(9 + estimatedLabelWidth / 4 + 5), yOffset: 9 + estimatedLabelHeight / 4 + 5 }
        ];

        let bestFit = null;
        let bestScore = -Infinity;

        for (const option of labelPlacementOptions) {
            const proposedLabelX = markerPixel.x + option.xOffset;
            const proposedLabelY = markerPixel.y + option.yOffset;

            const labelRect = {
                x1: proposedLabelX - estimatedLabelWidth / 2,
                y1: proposedLabelY - estimatedLabelHeight / 2,
                x2: proposedLabelX + estimatedLabelWidth / 2,
                y2: proposedLabelY + estimatedLabelHeight / 2
            };

            let currentScore = 0;

            if (labelRect.x1 < 0 || labelRect.x2 > mapSize.x || labelRect.y1 < 0 || labelRect.y2 > mapSize.y) {
                currentScore -= 50;
            }

            const markerRect = {
                x1: markerPixel.x - 9,
                y1: markerPixel.y - 9,
                x2: markerPixel.x + 9,
                y2: markerPixel.y + 9
            };
            if (
                labelRect.x1 < markerRect.x2 &&
                labelRect.x2 > markerRect.x1 &&
                labelRect.y1 < markerRect.y2 &&
                labelRect.y2 > markerRect.y1
            ) {
                currentScore -= 40;
            }

            let overlapsWithOtherLabels = false;
            for (const existingRect of displayedLabelRects) {
                if (
                    labelRect.x1 < existingRect.x2 &&
                    labelRect.x2 > existingRect.x1 &&
                    labelRect.y1 < existingRect.y2 &&
                    labelRect.y2 > existingRect.y1
                ) {
                    overlapsWithOtherLabels = true;
                    currentScore -= 100;
                    break;
                }
            }

            if (!overlapsWithOtherLabels) {
                if (option.direction === 'bottom') currentScore += 15;
                else if (option.direction === 'right') currentScore += 10;
                else if (option.direction === 'top') currentScore += 5;
                else if (option.direction === 'left') currentScore += 3;
            }

            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestFit = {
                    direction: option.direction,
                    offset: [option.xOffset, option.yOffset],
                    labelRect: labelRect
                };
            }
        }

        if (bestFit && bestScore >= -40) {
            markerData.tooltip.options.direction = bestFit.direction;
            markerData.tooltip.options.offset = bestFit.offset;
            markerData.tooltip.setOpacity(0.9);
            displayedLabelRects.push(bestFit.labelRect);
        } else {
            markerData.tooltip.setOpacity(0);
        }
    });
}

// 커스텀 아이콘 생성 함수 (이전 코드와 동일)
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
        tooltipAnchor: [0, 0]
    });
}

// 장소 상세 정보 표시 함수 (이전 코드와 동일)
function displayPlaceDetails(places) {
    const infoBox = document.getElementById('place-details');
    const placeContent = document.getElementById('place-content');
    
    let detailsHtml = '';

    places.forEach(place => {
        detailsHtml += `
            <div class="place-info-item">
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
        detailsHtml += `</div>`;
    });

    placeContent.innerHTML = detailsHtml;
    infoBox.classList.add('show');
}

// 정보 박스 닫기 함수 (이전 코드와 동일)
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show');
}

// 타입별 아이콘 반환 함수 (이전 코드와 동일)
function getTypeIcon(type) {
    switch (type) {
        case 'attractions': return '📷';
        case 'restaurants': return '🍴';
        case 'airports': return '✈️';
        case 'hotels': return '🏨';
        default: return '📍';
    }
}

// 타입별 한국어 이름 반환 함수 (이전 코드와 동일)
function getTypeDisplayName(type) {
    switch (type) {
        case 'attractions': return '관광지';
        case 'restaurants': return '음식점';
        case 'airports': return '공항';
        case 'hotels': return '호텔';
        default: return '기타';
    }
}

// --- 푸동 공항 - 동방명주 경로 관련 기능 ---

// 경로 그리기 함수
function drawRoute() {
    // 이전 API 호출에서 얻은 routeId
    const routeId = '3844472902883919133'; // 실제 routeId로 변경해야 합니다.

    // 이 routeId를 사용하여 경로를 가져오는 로직 (가정)
    // 실제로는 이 routeId를 사용하여 백엔드 API를 호출하거나,
    // 이미 저장된 경로 데이터를 사용하는 방식이 될 수 있습니다.
    // 여기서는 간단하게 하드코딩된 좌표를 사용합니다.
    const routeCoordinates = [
        [31.1443, 121.8053], // 푸동 공항
        [31.2393, 121.4996]  // 동방명주
    ];

    // 경로 선 그리기
    if (routePolyline) {
        map.removeLayer(routePolyline); // 기존 경로 제거
    }
    routePolyline = L.polyline(routeCoordinates, {
        color: 'blue',
        weight: 5,
        opacity: 0.7
    }).addTo(map);

    // 경로 전체가 보이도록 지도 뷰 조정
    map.fitBounds(routePolyline.getBounds().pad(0.2));
}
