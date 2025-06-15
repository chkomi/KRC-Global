// 전역 변수
let map;
let markers = L.featureGroup();
let currentTileLayer;
let shanghaiData = null;
let allMarkers = []; // 모든 마커를 저장할 배열
let markerGroups = {
    attractions: L.featureGroup(),
    restaurants: L.featureGroup(),
    hotels: L.featureGroup(),
    airports: L.featureGroup()
};
let clickedMarkers = []; // 클릭된 마커들을 저장할 배열

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

    // 기본 심플 타일 레이어 추가 (실제로 cartodb 적용)
    currentTileLayer = tileLayers.cartodb;
    currentTileLayer.addTo(map);

    console.log('기본 지도 타일:', 'cartodb'); // 디버깅용

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

    // 마커 그룹들을 지도에 추가
    Object.values(markerGroups).forEach(group => {
        group.addTo(map);
    });

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
        // (정보 박스 내부는 닫히지 않게 하기 위함)
        if (!e.originalEvent || !e.originalEvent.target || !e.originalEvent.target.closest('#place-details')) {
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
}

// 마커 그룹 토글 함수
function toggleMarkerGroup(type, show) {
    if (show) {
        markerGroups[type].addTo(map);
    } else {
        map.removeLayer(markerGroups[type]);
    }
    // 라벨 가시성 업데이트
    // 그룹 토글 후 약간의 지연을 주어 지도 렌더링이 완료된 후 라벨을 재배치
    setTimeout(() => {
        updateLabelVisibility();
    }, 100);
}

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('데이터가 없습니다.');
        return;
    }

    // 기존 마커들 제거
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // 각 타입별로 마커 생성
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];
    
    // 위치별로 마커를 그룹화하여 같은 좌표에 여러 장소가 있는 경우를 처리
    const locationsMap = new Map(); // Key: "lat,lng", Value: Array of places

    types.forEach(type => {
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
        // 같은 위치에 있는 첫 번째 장소를 대표로 마커를 생성
        const representativePlace = placesAtLocation[0]; 
        const marker = L.marker([representativePlace.latitude, representativePlace.longitude], {
            icon: createCustomIcon(representativePlace.type) // 첫 번째 장소의 타입으로 아이콘 생성
        }).addTo(markerGroups[representativePlace.type]); // 첫 번째 장소의 그룹에 추가

        // 라벨 생성
        const tooltip = L.tooltip({
            permanent: true,
            direction: 'auto', // direction은 updateLabelVisibility에서 동적으로 설정
            offset: [0, 0],
            className: 'place-label',
            opacity: 0, // 초기에는 숨김 (JS에서 제어)
            interactive: false // 툴팁이 클릭 이벤트에 반응하지 않도록
        });

        marker.bindTooltip(tooltip); // 툴팁을 마커에 바인딩
        
        marker.on('click', () => {
            displayPlaceDetails(placesAtLocation); // 해당 위치의 모든 장소 정보를 전달
            map.flyTo([representativePlace.latitude, representativePlace.longitude], 15);
        });

        // 마커 정보를 배열에 저장 (대표 장소와 해당 위치의 모든 장소 정보를 포함)
        allMarkers.push({
            marker: marker,
            tooltip: tooltip,
            places: placesAtLocation, // 해당 위치의 모든 장소 정보
            representativePlace: representativePlace, // 라벨 표시에 사용될 대표 장소
            group: representativePlace.type
        });
    });

    // 지도 뷰 조정
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


// 라벨 가시성 및 배치 업데이트 함수 (개선된 버전)
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    const mapSize = map.getSize();

    // 이전에 표시된 모든 라벨 숨기기
    allMarkers.forEach(markerData => {
        markerData.tooltip.setOpacity(0);
        // 툴팁 방향을 초기화하여 새로운 계산이 반영되도록 함
        markerData.tooltip.options.direction = 'auto'; 
    });

    // 현재 보이는 마커 그룹에 속하고, 지도 범위 내에 있는 마커들만 필터링
    let visibleMarkersInBounds = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        const isGroupVisible = map.hasLayer(markerGroups[markerData.group]);
        // 줌 레벨에 따라 라벨 표시 여부 결정
        // 낮은 줌 레벨에서는 너무 많은 라벨이 겹치지 않도록 제한
        const showLabelByZoom = (currentZoom >= 14); // 예시: 줌 레벨 14 이상일 때만 라벨 표시

        // 같은 위치에 여러 마커가 있을 경우, 대표 장소의 이름으로 라벨 표시
        markerData.tooltip.setContent(markerData.representativePlace.name);
        
        return isInBounds && isGroupVisible && showLabelByZoom;
    });

    // 라벨 표시 우선순위 정렬: 이름이 짧은 라벨을 먼저 배치하여 겹침을 최소화 (선택 사항)
    visibleMarkersInBounds.sort((a, b) => {
        return a.representativePlace.name.length - b.representativePlace.name.length;
    });

    const displayedLabelRects = []; // 이미 배치된 라벨의 경계 상자를 저장

    // 가능한 툴팁 방향 및 오프셋 정의 (우선순위 부여 가능)
    // 오프셋은 마커 중심으로부터 라벨 중심까지의 대략적인 거리를 나타냅니다.
    const labelDirections = [
        { name: 'right', offset: [30, 0] },     // 마커 오른쪽
        { name: 'bottom', offset: [0, 30] },    // 마커 아래쪽
        { name: 'top', offset: [0, -30] },      // 마커 위쪽
        { name: 'left', offset: [-30, 0] },     // 마커 왼쪽
        { name: 'topright', offset: [20, -20] },
        { name: 'bottomright', offset: [20, 20] },
        { name: 'topleft', offset: [-20, -20] },
        { name: 'bottomleft', offset: [-20, 20] }
    ];

    visibleMarkersInBounds.forEach(markerData => {
        const markerLatLng = markerData.marker.getLatLng();
        const markerPixel = map.latLngToContainerPoint(markerLatLng);

        let bestFit = null;
        let bestScore = -Infinity; // 가장 낮은 점수에서 시작

        // 라벨의 대략적인 크기 추정 (CSS의 .place-label 스타일에 따라 조정 필요)
        // font-size: 0.8em (약 12.8px), padding: 4px 8px
        // 높이: 12.8px (폰트) + 4px*2 (상하 패딩) = 약 20.8px -> 약 22px
        // 너비: 글자수 * 7px + 8px*2 (좌우 패딩) = 글자수 * 7 + 16px (대략)
        const estimatedLabelWidth = markerData.representativePlace.name.length * 7 + 16; 
        const estimatedLabelHeight = 22; 

        for (const dir of labelDirections) {
            // 라벨 중심의 픽셀 좌표
            const proposedLabelX = markerPixel.x + dir.offset[0];
            const proposedLabelY = markerPixel.y + dir.offset[1];

            // 라벨의 경계 상자 계산 (중심점 기준)
            const labelRect = {
                x1: proposedLabelX - estimatedLabelWidth / 2,
                y1: proposedLabelY - estimatedLabelHeight / 2,
                x2: proposedLabelX + estimatedLabelWidth / 2,
                y2: proposedLabelY + estimatedLabelHeight / 2
            };

            let currentScore = 0; // 초기 점수

            // 1. 지도 경계 밖으로 나가는지 확인 (-50점)
            if (labelRect.x1 < 0 || labelRect.x2 > mapSize.x || labelRect.y1 < 0 || labelRect.y2 > mapSize.y) {
                currentScore -= 50; 
            }

            // 2. 마커와 라벨의 겹침 방지 (마커 자체와의 겹침)
            // 마커 크기 18x18, 앵커 [9,9]
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

            // 3. 기존에 배치된 라벨들과 겹치는지 확인 (-100점)
            let overlapsWithOtherLabels = false;
            for (const existingRect of displayedLabelRects) {
                if (
                    labelRect.x1 < existingRect.x2 &&
                    labelRect.x2 > existingRect.x1 &&
                    labelRect.y1 < existingRect.y2 &&
                    labelRect.y2 > existingRect.y1
                ) {
                    overlapsWithOtherLabels = true;
                    currentScore -= 100; // 겹치면 가장 크게 감점
                    break;
                }
            }

            // 4. 선호하는 방향에 가산점
            if (!overlapsWithOtherLabels) { // 겹치지 않는 경우에만 가산점 부여
                if (dir.name === 'right') currentScore += 10;
                else if (dir.name === 'bottom') currentScore += 8;
                else if (dir.name === 'left' || dir.name === 'top') currentScore += 5;
                else if (dir.name.includes('right')) currentScore += 3; // 대각선 오른쪽 선호
            }


            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestFit = {
                    direction: dir.name,
                    offset: dir.offset,
                    labelRect: labelRect // 이 위치에 배치될 경우의 경계 상자
                };
            }
        }

        // 최적의 위치를 찾았고, 점수가 양수이면 라벨을 표시
        // 점수 기준을 0이 아닌 최소값으로 설정하여 너무 열악한 위치는 피함
        if (bestFit && bestScore >= -30) { // 최소 점수를 조정하여 라벨 표시 여부 제어
            markerData.tooltip.options.direction = bestFit.direction;
            markerData.tooltip.options.offset = bestFit.offset;
            markerData.tooltip.setOpacity(0.9); // 라벨 표시
            displayedLabelRects.push(bestFit.labelRect); // 배치된 라벨의 경계 상자 추가
        } else {
            markerData.tooltip.setOpacity(0); // 표시하지 않음
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
        // tooltipAnchor는 CSS transform: translate(-50%, -50%)와 함께
        // 툴팁의 중심이 마커의 앵커 포인트에 정렬되도록 [0,0]으로 설정
        // 실제 오프셋은 JS의 offset 옵션으로 조절
        tooltipAnchor: [0, 0] 
    });
}

// 장소 상세 정보 표시 함수 (여러 장소 처리)
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
        detailsHtml += `</div>`; // .place-info-item 닫기
    });

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
