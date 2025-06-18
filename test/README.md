# 🧪 상하이 여행지도 - 테스트 버전

## 📋 개요
이 폴더는 상하이 여행지도의 테스트 및 개발 버전입니다. 새로운 기능과 이미지를 안전하게 테스트할 수 있습니다.

## 🚀 사용법

### 로컬에서 테스트
```bash
# 테스트 페이지 접속
http://localhost:포트/test/index.html
```

### GitHub Pages에서 테스트
```
https://chkomi.github.io/KRC-Global/test/
```

## 📁 폴더 구조
```
test/
├── index.html          # 테스트용 메인 페이지
├── script.js           # 테스트용 JavaScript
├── styles.css          # 테스트용 CSS
├── data/               # 테스트용 데이터
│   └── shanghai-data.json
├── images/             # 테스트용 이미지
│   ├── attractions/
│   ├── restaurants/
│   ├── hotels/
│   └── airports/
└── README.md           # 이 파일
```

## 🎯 테스트 목적

### 1. 이미지 테스트
- 새로운 이미지 추가 및 최적화
- 이미지 로딩 성능 테스트
- 반응형 이미지 디자인 테스트

### 2. 기능 테스트
- 새로운 UI/UX 기능
- 팝업 디자인 개선
- 지도 기능 확장

### 3. 데이터 테스트
- 새로운 장소 추가
- 데이터 구조 변경
- API 연동 테스트

## 🔄 개발 워크플로우

### 1. 테스트 개발
```bash
# 테스트 폴더에서 작업
cd test/
# 파일 수정 및 테스트
```

### 2. 검증 완료 후 메인 적용
```bash
# 테스트 완료된 파일들을 메인으로 복사
cp test/script.js ./
cp test/styles.css ./
cp test/data/shanghai-data.json data/
cp -r test/images/* images/
```

### 3. Git 커밋
```bash
git add .
git commit -m "테스트 완료된 기능 적용"
git push
```

## ⚠️ 주의사항

1. **테스트 배너**: 테스트 버전임을 나타내는 배너가 상단에 표시됩니다
2. **데이터 분리**: 테스트용 데이터는 별도로 관리됩니다
3. **이미지 관리**: 테스트용 이미지는 `test/images/`에서 관리됩니다

## 🎨 테스트용 특별 기능

- `window.isTestMode = true`: 테스트 모드 감지
- `testImageLoading()`: 이미지 로딩 테스트 함수
- `testPopupDesign()`: 팝업 디자인 테스트 함수

## 📝 개발 로그

### 2024년 현재
- ✅ 테스트 환경 구축 완료
- ✅ 이미지 폴더 구조 생성
- ✅ 기본 테스트 페이지 생성
- 🔄 이미지 테스트 기능 개발 중

---

**메인 버전**: [../index.html](../index.html)
**GitHub 저장소**: [https://github.com/chkomi/KRC-Global](https://github.com/chkomi/KRC-Global) 