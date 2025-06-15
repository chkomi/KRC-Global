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
        if (e.originalEvent && e.originalEvent.target === e.originalEvent.currentTarget) {
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
    
    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach((place, index) => {
            const marker = L.marker([place.latitude, place.longitude], {
                icon: createCustomIcon(type)
            }).addTo(markerGroups[type]);

            // 라벨 생성 (항상 표시되지만 처음에는 숨김)
            // 툴팁을 마커에 바인딩하되, 초기에는 opacity를 0으로 설정하여 숨김
            const tooltip = L.tooltip({
                permanent: true,
                direction: 'auto', // direction은 아래 updateLabelVisibility에서 동적으로 설정
                offset: [0, 0],
                className: 'place-label',
                opacity: 0,
                interactive: false // 툴팁이 클릭 이벤트에 반응하지 않도록
            });

            marker.bindTooltip(tooltip); // 툴팁을 마커에 바인딩
            
            marker.on('click', () => {
                displayPlaceDetails({...place, type: type});
                map.flyTo([place.latitude, place.longitude], 15);
            });

            // 마커 정보를 배열에 저장
            allMarkers.push({
                marker: marker,
                tooltip: tooltip,
                place: {...place, type: type},
                // visible 속성은 더 이상 사용하지 않음. 툴팁의 opacity로 제어
                group: type
            });
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
        markerData.tooltip.options.direction = 'auto'; // 초기화
    });

    // 현재 보이는 마커 그룹에 속하고, 지도 범위 내에 있는 마커들만 필터링
    let visibleMarkersInBounds = allMarkers.filter(markerData => {
        const latLng = markerData.marker.getLatLng();
        const isInBounds = bounds.contains(latLng);
        const isGroupVisible = map.hasLayer(markerGroups[markerData.group]);
        return isInBounds && isGroupVisible;
    });

    // 우선순위 정렬 (예: 줌 레벨이 높을수록 모든 라벨 표시, 낮을수록 중요한 라벨만 표시)
    // 여기서는 간단히 모든 마커를 대상으로 하되, 복잡한 겹침 제거 로직을 적용합니다.
    // 필요에 따라 중요도나 이름 길이에 따라 정렬하여 라벨 표시 우선순위를 줄 수 있습니다.
    visibleMarkersInBounds.sort((a, b) => {
        // 예를 들어, 이름 길이에 따라 정렬하여 짧은 이름을 가진 라벨이 먼저 배치되도록 할 수 있습니다.
        return a.place.name.length - b.place.name.length;
    });

    const displayedLabelRects = []; // 이미 배치된 라벨의 경계 상자를 저장

    // 가능한 툴팁 방향 및 오프셋 정의 (우선순위 부여 가능)
    const labelDirections = [
        { name: 'right', offset: [15, 0] },
        { name: 'left', offset: [-15, 0] },
        { name: 'bottom', offset: [0, 15] },
        { name: 'top', offset: [0, -15] },
        { name: 'topright', offset: [10, -10] },
        { name: 'topleft', offset: [-10, -10] },
        { name: 'bottomright', offset: [10, 10] },
        { name: 'bottomleft', offset: [-10, 10] }
    ];

    visibleMarkersInBounds.forEach(markerData => {
        const markerLatLng = markerData.marker.getLatLng();
        const markerPixel = map.latLngToContainerPoint(markerLatLng);

        let bestFit = null;
        let bestScore = -1;

        // 라벨의 대략적인 크기 (글자 수에 비례하여 추정)
        // 실제 렌더링된 너비를 얻기 어렵기 때문에 추정치를 사용합니다.
        // CSS에서 .place-label 스타일을 보고 조정해야 합니다.
        const estimatedLabelWidth = markerData.place.name.length * 7 + 10; // 폰트 크기 고려
        const estimatedLabelHeight = 20; // 폰트 높이 고려

        for (const dir of labelDirections) {
            const proposedLabelX = markerPixel.x + dir.offset[0];
            const proposedLabelY = markerPixel.y + dir.offset[1];

            // 라벨의 경계 상자 계산
            const labelRect = {
                x1: proposedLabelX - estimatedLabelWidth / 2,
                y1: proposedLabelY - estimatedLabelHeight / 2,
                x2: proposedLabelX + estimatedLabelWidth / 2,
                y2: proposedLabelY + estimatedLabelHeight / 2
            };

            let currentScore = 100; // 초기 점수
            let overlaps = false;

            // 지도 경계 밖으로 나가는지 확인
            if (labelRect.x1 < 0 || labelRect.x2 > mapSize.x || labelRect.y1 < 0 || labelRect.y2 > mapSize.y) {
                currentScore -= 50; // 경계 밖이면 점수 크게 감소
            }

            // 마커와의 거리 유지 (너무 가까우면 점수 감소)
            const distanceToMarker = Math.sqrt(dir.offset[0] * dir.offset[0] + dir.offset[1] * dir.offset[1]);
            if (distanceToMarker < 10) currentScore -= 30; // 마커에 너무 붙으면 점수 감소

            // 기존에 배치된 라벨들과 겹치는지 확인
            for (const existingRect of displayedLabelRects) {
                if (
                    labelRect.x1 < existingRect.x2 &&
                    labelRect.x2 > existingRect.x1 &&
                    labelRect.y1 < existingRect.y2 &&
                    labelRect.y2 > existingRect.y1
                ) {
                    overlaps = true;
                    currentScore -= 100; // 겹치면 점수 크게 감소
                    break;
                }
            }

            // 겹치지 않는 방향에 가산점
            if (!overlaps) {
                // 선호하는 방향에 추가 가산점 (예: right, bottom)
                if (dir.name === 'right') currentScore += 10;
                else if (dir.name === 'bottom') currentScore += 8;
                else if (dir.name === 'left' || dir.name === 'top') currentScore += 5;
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

        // 최적의 위치를 찾았다면 라벨을 표시하고, 해당 라벨의 경계 상자를 저장
        if (bestFit && bestScore > 0) { // 최소 점수 이상이어야 표시
            markerData.tooltip.options.direction = bestFit.direction;
            markerData.tooltip.options.offset = bestFit.offset;
            markerData.tooltip.setOpacity(0.9); // 라벨 표시
            displayedLabelRects.push(bestFit.labelRect); // 배치된 라벨의 경계 상자 추가
        } else {
            markerData.tooltip.setOpacity(0); // 표시하지 않음
        }
    });

    // 줌 레벨에 따라 라벨 표시 여부 결정 (옵션)
    // 예를 들어, 줌 레벨 14 미만에서는 모든 라벨을 숨길 수 있습니다.
    if (currentZoom < 14) { // 이 값은 조정 가능
        allMarkers.forEach(markerData => {
            markerData.tooltip.setOpacity(0);
        });
    }
}


// 툴팁 오프셋 계산 함수 (더 이상 사용되지 않지만, 다른 곳에서 필요할 경우를 대비)
// function getTooltipOffset(direction) {
//     const baseOffset = 22; // 마커와의 기본 거리
//     switch (direction) {
//         case 'top': return [0, -baseOffset];
//         case 'bottom': return [0, baseOffset];
//         case 'right': return [baseOffset, 0];
//         case 'left': return [-baseOffset, 0];
//         case 'topright': return [baseOffset * 0.8, -baseOffset * 0.8];
//         case 'topleft': return [-baseOffset * 0.8, -baseOffset * 0.8];
//         case 'bottomright': return [baseOffset * 0.8, baseOffset * 0.8];
//         case 'bottomleft': return [-baseOffset * 0.8, baseOffset * 0.8];
//         default: return [baseOffset, 0];
//     }
// }

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
        tooltipAnchor: [0, -15] // 툴팁 앵커는 기본값으로 둔다. offset으로 조절
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
