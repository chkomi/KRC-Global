// 전역 변수 (기존과 동일)
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커를 저장할 배열
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroups(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};
let clickedMarkers = []; // 클릭된 마커들을 저장할 배열

// 경로 관련 전역 변수
let routePolyline = null;
let routeInfoControl = null;

// 문서 로드 완료 시 초기화 (기존과 동일)
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initializeMap();
    setupEventListeners();
    drawRouteAndInfo(); // 경로 그리기 함수 호출 추가
});

// 데이터 로드 함수 (기존과 동일)
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

// 지도 초기화 함수 (기존과 동일)
function initializeMap() {
    map = L.map('map').setView([31.2304, 121.4737], 12);

    const tileLayers = {
        cartodb: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }),
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics',
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
        // 줌/이동 시 경로 정보 위치도 업데이트 (필요하다면)
        if (routeInfoControl) {
            map.removeControl(routeInfoControl);
            routeInfoControl = null; // 컨트롤 삭제 후 재생성 (간단한 방법)
            drawRouteInfo(); // 경로 정보 다시 그리기
        }
    });
}

// 이벤트 리스너 설정 (기존과 동일, 지도 클릭 이벤트 수정 포함)
function setupEventListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeInfoBox();
        }
    });

    map.on('click', (e) => {
        // 마커나 정보 박스 내부 클릭이 아닌 경우에만 정보 박스 닫기
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

// 마커 그룹 토글 함수 (기존과 동일)
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

// 마커 표시 함수 (기존과 동일, tooltipAnchor 수정)
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

        // 라벨 생성: permanent: true, opacity: 0 (JS가 제어)
        const tooltip = L.tooltip({
            permanent: true,
            direction: 'bottom', // 기본 방향 (JS에서 변경 가능)
            offset: [0, 0], // CSS transform과 JS 로직으로 제어
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

    // 초기 라벨 가시성 설정
    setTimeout(() => {
        updateLabelVisibility();
    }, 500);
}

// 라벨 가시성 및 배치 업데이트 함수 (더욱 안정적인 버전)
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    const mapSize = map.getSize();

    // 1. 모든 라벨 숨기기
    allMarkers.forEach(markerData => {
        markerData.tooltip.setOpacity(0);
    });

    // 2. 특정 줌 레벨 이상에서만 라벨 표시 (이 값을 조절하여 라벨이 보이는 줌 레벨 변경)
    const labelVisibleZoomLevel = 13; 

    if (currentZoom < labelVisibleZoomLevel) {
        return; // 줌 레벨이 낮으면 모든 라벨 숨기고 종료
    }

    // 3. 현재 지도 범위 내에 있는 마커들만 필터링 (활성화된 그룹만)
    let visibleMarkersInBounds = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        // markerGroups 객체가 존재하고 해당 그룹 키가 있는지 확인
        const isGroupVisible = markerGroups && markerGroups[markerData.group] && map.hasLayer(markerGroups[markerData.group]);
        return isInBounds && isGroupVisible;
    });

    // 4. 라벨 배치 우선순위 정렬 (예: 이름이 짧거나, 특정 타입 우선 등)
    // 여기서는 이름 길이에 따라 정렬하여 겹침을 최소화 (짧은 이름 먼저 배치)
    visibleMarkersInBounds.sort((a, b) => {
        return a.representativePlace.name.length - b.representativePlace.name.length;
    });

    const displayedLabelRects = []; // 이미 배치된 라벨의 화면상 경계 상자를 저장

    // 5. 각 라벨에 대해 최적의 위치 찾기 및 표시
    visibleMarkersInBounds.forEach(markerData => {
        const markerLatLng = markerData.marker.getLatLng();
        const markerPixel = map.latLngToContainerPoint(markerLatLng);

        const labelText = markerData.representativePlace.name;
        markerData.tooltip.setContent(labelText); // 툴팁 내용 업데이트

        // 라벨의 대략적인 크기 추정 (CSS의 .place-label 스타일에 맞춰 조정 필요)
        // font-size: 0.8em (약 12.8px), padding: 4px 8px
        // 높이: 12.8px (폰트) + 4px*2 (상하 패딩) = 약 20.8px -> 22px
        // 너비: 글자수 * 7px + 8px*2 (좌우 패딩) = 글자수 * 7 + 16px
        const estimatedLabelWidth = labelText.length * 7 + 16; 
        const estimatedLabelHeight = 22; 

        // 가능한 툴팁 방향 및 오프셋 정의 (선호하는 방향을 위에 배치)
        // offset은 마커 앵커 기준 (iconAnchor) 라벨의 중앙까지의 거리 (픽셀)
        const labelPlacementOptions = [
            // [방향, X오프셋, Y오프셋]
            { direction: 'bottom', xOffset: 0, yOffset: 18 + estimatedLabelHeight / 2 }, // 마커 바로 아래
            { direction: 'right', xOffset: 9 + estimatedLabelWidth / 2 + 5, yOffset: 0 },  // 마커 오른쪽
            { direction: 'left', xOffset: -(9 + estimatedLabelWidth / 2 + 5), yOffset: 0 }, // 마커 왼쪽
            { direction: 'top', xOffset: 0, yOffset: -(9 + estimatedLabelHeight / 2 + 5) },// 마커 위쪽
            { direction: 'bottomright', xOffset: 9 + estimatedLabelWidth / 4 + 5, yOffset: 9 + estimatedLabelHeight / 4 + 5 },
            { direction: 'bottomleft', xOffset: -(9 + estimatedLabelWidth / 4 + 5), yOffset: 9 + estimatedLabelHeight / 4 + 5 }
        ];

        let bestFit = null;
        let bestScore = -Infinity; // 가장 낮은 점수에서 시작

        for (const option of labelPlacementOptions) {
            // 라벨 중심의 픽셀 좌표 (마커 중심 기준)
            const proposedLabelX = markerPixel.x + option.xOffset;
            const proposedLabelY = markerPixel.y + option.yOffset;

            // 라벨의 경계 상자 계산 (중심점 기준)
            const labelRect = {
                x1: proposedLabelX - estimatedLabelWidth / 2,
                y1: proposedLabelY - estimatedLabelHeight / 2,
                x2: proposedLabelX + estimatedLabelWidth / 2,
                y2: proposedLabelY + estimatedLabelHeight / 2
            };

            let currentScore = 0; 

            // 1. 지도 경계 밖으로 나가는지 확인 (-50점)
            if (labelRect.x1 < 0 || labelRect.x2 > mapSize.x || labelRect.y1 < 0 || labelRect.y2 > mapSize.y) {
                currentScore -= 50; 
            }

            // 2. 마커 아이콘 자체와의 겹침 방지 (마커 아이콘 크기 18x18, 앵커 [9,9])
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
                currentScore -= 40; // 마커와 겹치면 감점
            }

            // 3. 기존에 배치된 다른 라벨들과 겹치는지 확인 (-100점)
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

            // 4. 선호하는 방향에 가산점 (겹치지 않는 경우에만)
            if (!overlapsWithOtherLabels) {
                if (option.direction === 'bottom') currentScore += 15; // 아래쪽 선호도 높임
                else if (option.direction === 'right') currentScore += 10;
                else if (option.direction === 'top') currentScore += 5;
                else if (option.direction === 'left') currentScore += 3;
            }

            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestFit = {
                    direction: option.direction,
                    offset: [option.xOffset, option.yOffset], // 마커 앵커 기준
                    labelRect: labelRect 
                };
            }
        }

        // 최적의 위치를 찾았고, 점수가 특정 기준 이상이면 라벨을 표시
        // 겹치지 않으면 0점 이상, 마커와 겹쳐도 -40점 이상이면 표시 고려
        if (bestFit && bestScore >= -40) { // 이 최소 점수를 조절하여 라벨 표시 여부 제어
            markerData.tooltip.options.direction = bestFit.direction;
            markerData.tooltip.options.offset = bestFit.offset;
            markerData.tooltip.setOpacity(0.9); 
            displayedLabelRects.push(bestFit.labelRect); // 배치된 라벨의 경계 상자 추가
        } else {
            markerData.tooltip.setOpacity(0); // 표시하지 않음
        }
    });
}

// 커스텀 아이콘 생성 함수 (tooltipAnchor 수정)
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
        iconAnchor: [9, 9], // 마커의 중심
        tooltipAnchor: [0, 0] // 툴팁의 중심이 마커의 iconAnchor에 맞춰지도록 설정
    });
}

// 장소 상세 정보 표시 함수 (기존과 동일)
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

// 정보 박스 닫기 함수 (기존과 동일)
function closeInfoBox() {
    const infoBox = document.getElementById('place-details');
    infoBox.classList.remove('show');
}

// 타입별 아이콘 반환 함수 (기존과 동일)
function getTypeIcon(type) {
    switch (type) {
        case 'attractions': return '📷';
        case 'restaurants': return '🍴';
        case 'airports': return '✈️';
        case 'hotels': return '🏨';
        default: return '📍';
    }
}

// 타입별 한국어 이름 반환 함수 (기존과 동일)
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

// 경로 그리기 및 정보 표시 함수
function drawRouteAndInfo() {
    // 푸동 공항 (PVG) 대략적인 좌표
    const pudongAirport = [31.1443, 121.8053]; 
    // 동방명주(Oriental Pearl Tower) 대략적인 좌표
    const orientalPearlTower = [31.2393, 121.4996]; 

    // 두 지점 사이의 간단한 직선 경로 (API를 사용하지 않는 경우)
    const routeCoordinates = [
        pudongAirport,
        orientalPearlTower
    ];

    // 실제 경로 API를 사용하면 더 정확한 중간 지점들이 포함됨
    // 여기서는 간단한 시뮬레이션용 가상의 중간 지점을 추가하여 곡선처럼 보이게 할 수 있음
    // 예: [pudongAirport, [31.2, 121.6], orientalPearlTower]

    // 경로 선 그리기
    if (routePolyline) {
        map.removeLayer(routePolyline); // 기존 경로 제거
    }
    routePolyline = L.polyline(routeCoordinates, {
        color: 'red',
        weight: 3, // 굵지 않게
        opacity: 0.7
    }).addTo(map);

    // 경로 전체가 보이도록 지도 뷰 조정
    map.fitBounds(routePolyline.getBounds().pad(0.2));

    // 경로 정보 표시
    drawRouteInfo();
}

// 경로 정보 (예상 시간/거리) 표시 함수
function drawRouteInfo() {
    // 가상의 예상 시간과 거리 (실제 API 호출 시 이 값은 API 응답에서 가져옴)
    const estimatedTime = "약 50분"; 
    const estimatedDistance = "약 40km"; 
    const infoText = `${estimatedTime} / ${estimatedDistance}`;

    // 경로의 중앙 지점 계산
    if (!routePolyline) return;
    const centerLatLng = routePolyline.getCenter();

    // 기존 컨트롤이 있다면 제거
    if (routeInfoControl) {
        map.removeControl(routeInfoControl);
    }

    // Leaflet 커스텀 컨트롤 생성
    routeInfoControl = L.control({position: 'topleft'});

    routeInfoControl.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'route-info-control');
        div.innerHTML = `<div class="route-info-content">${infoText}</div>`;
        return div;
    };

    routeInfoControl.addTo(map);

    // 컨트롤의 위치를 경로 중앙으로 이동 (약간의 조정 필요)
    // Leaflet 컨트롤은 직접 픽셀 위치를 지정하기 어렵고, 미리 정의된 위치(topleft, bottomright 등)에 붙습니다.
    // 경로 위에 직접 텍스트를 오버레이 하려면 Leaflet DivIcon + Marker, 또는 Custom Control의 CSS position을 정교하게 제어해야 합니다.
    // 여기서는 간단히 topleft에 표시하고 CSS로 미세 조정하는 방식을 사용합니다.
}
