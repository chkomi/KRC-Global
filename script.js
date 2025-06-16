// ... (기존 코드 생략) ...

// 마커 표시 함수
function displayMarkers() {
    if (!shanghaiData || !shanghaiData.shanghai_tourism) {
        console.error('마커를 표시할 데이터가 없습니다.');
        return;
    }

    // 기존 마커들 제거 및 배열 초기화
    Object.values(markerGroups).forEach(group => {
        group.clearLayers();
    });
    allMarkers = [];

    // 모든 장소 데이터를 하나의 배열로 합치기
    const allPlaces = [];
    const types = ['attractions', 'restaurants', 'hotels', 'airports'];

    types.forEach(type => {
        const places = shanghaiData.shanghai_tourism[type];
        places.forEach(place => {
            allPlaces.push({...place, type: type});
        });
    });

    // 위치(좌표)별로 장소들을 그룹화 (동일 좌표에 여러 장소가 있을 수 있으므로)
    const locationGroups = {};

    allPlaces.forEach(place => {
        // 부동 소수점 문제 방지를 위해 위도, 경도 정밀도를 고정하여 키 생성
        const lat = parseFloat(place.latitude).toFixed(4);
        const lng = parseFloat(place.longitude).toFixed(4);
        const locationKey = `${lat},${lng}`;

        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = {
                latitude: place.latitude,
                longitude: place.longitude,
                places: [] // 이 위치에 해당하는 모든 장소들
            };
        }
        locationGroups[locationKey].places.push(place);
    });

    // 각 위치 그룹에 대해 마커 생성
    Object.values(locationGroups).forEach(group => {
        // 동일 좌표에 여러 타입의 장소가 있을 경우, 아이콘 표시 우선순위를 결정
        const priorityOrder = { 'airports': 1, 'attractions': 2, 'hotels': 3, 'restaurants': 4 };
        const mainType = group.places.reduce((prev, curr) =>
            (priorityOrder[prev.type] < priorityOrder[curr.type] ? prev : curr)
        ).type;

        // 마커 생성 및 해당 마커 그룹에 추가
        const marker = L.marker([group.latitude, group.longitude], {
            icon: createCustomIcon(mainType)
        }).addTo(markerGroups[mainType]);

        // 라벨 텍스트 생성 (한글 부분만 추출)
        let labelText;
        if (group.places.length === 1) {
            const place = group.places[0];
            labelText = extractKorean(place.name);
            // 호텔 카테고리이고 가격 정보가 있을 경우 가격 추가 및 개행 처리
            if (place.type === 'hotels' && place.price) {
                const formattedPrice = parseInt(place.price).toLocaleString('ko-KR') + '원';
                labelText += `<br><span style="font-size:0.8em; color:#555;">${formattedPrice}</span>`;
            }
        } else {
            const firstPlaceName = extractKorean(group.places[0].name);
            labelText = `${firstPlaceName} 외 ${group.places.length - 1}곳`;
        }

        // 마커 클릭 시 정보 박스 표시 및 지도를 해당 위치로 이동
        marker.on('click', () => {
            displayGroupDetails(group);
            map.flyTo([group.latitude, group.longitude], 15); // 클릭 시 줌 레벨 15로 확대
        });

        // 툴팁(라벨)을 마커 하단에 바인딩하고 동적으로 스타일 적용
        const tooltip = marker.bindTooltip(labelText, {
            permanent: true, // 항상 툴팁이 활성화되도록 설정 (CSS로 가시성 제어)
            direction: 'bottom', // 라벨을 마커 하단에 배치
            offset: [0, 15], // 마커 중앙에서 아래로 15px 이동
            className: 'leaflet-tooltip', // 커스텀 라벨 스타일 클래스 적용
            opacity: 0 // 초기에는 CSS로 투명하게 설정 (나중에 나타나도록)
        }).getTooltip();

        // 툴팁의 왼쪽 테두리 색상을 마커의 타입에 따라 동적으로 설정
        tooltip.getElement().style.borderLeft = `4px solid ${markerColors[mainType] || '#3498db'}`;


        // 라벨 가시성 제어를 위해 마커 정보와 툴팁 엘리먼트를 배열에 저장
        allMarkers.push({
            marker: marker,
            labelText: labelText,
            group: group,
            labelVisible: false, // 초기 라벨 가시성 상태
            groupType: mainType,
            tooltipElement: tooltip.getElement() // 툴팁 DOM 엘리먼트 참조 저장
        });
    });

    // ... (나머지 displayMarkers 함수 및 기타 함수들은 동일) ...
}

// ... (나머지 script.js 코드 생략) ...
