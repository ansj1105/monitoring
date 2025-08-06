# 회원통합 모니터링 시스템

회원통합 전환과 신규 통합회원 데이터를 모니터링하는 웹 애플리케이션입니다.

## 주요 기능

- **통합 신규 + 전환 회원수** 모니터링
- **통합 신규 회원수** 모니터링  
- **통합 전환 회원수** 모니터링
- **실물 카드 신청수** 모니터링
- **온라인 카드 자동 발급 수** 모니터링
- 일별/기간별 데이터 조회
- 실시간 대시보드

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
DB_HOST=tardis-prod-cluster-database.cluster-ccagrtlwwujz.ap-northeast-2.rds.amazonaws.com
DB_NAME=seoul_ev_evcloud_new
DB_PORT=5432
DB_USER=evWhere
DB_PASSWORD=postgres
PORT=3000
```

### 3. 서버 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

### 4. 웹 브라우저에서 접속
```
http://localhost:3000
```

## API 엔드포인트

### 일별 데이터 조회
```
GET /api/monitoring/daily/{date}
```
예: `/api/monitoring/daily/2025-07-28`

### 기간별 모든 지표 조회
```
GET /api/monitoring/all-metrics?startDate={start}&endDate={end}
```
예: `/api/monitoring/all-metrics?startDate=2025-07-28&endDate=2025-07-28`

### 개별 지표 조회
- `GET /api/monitoring/total-integrated-users?startDate={start}&endDate={end}`
- `GET /api/monitoring/new-integrated-users?startDate={start}&endDate={end}`
- `GET /api/monitoring/converted-integrated-users?startDate={start}&endDate={end}`
- `GET /api/monitoring/physical-card-requests?startDate={start}&endDate={end}`
- `GET /api/monitoring/online-auto-issued-cards?startDate={start}&endDate={end}`

## 데이터 구분 기준

### 통합전환
- `user_merge_yn = 'Y'` **AND** `reg_dt < '2025-07-28 05:00:00'`

### 신규 통합회원(신규가입)
- `user_merge_yn = 'Y'` **AND** `reg_dt >= '2025-07-28 05:00:00'`

### KST 회원통합 배포 시작 시간
- **2025-07-28 14:00 ~ 24:00 (KST)**
- UTC로 변환 → **2025-07-28 05:00:00 ~ 2025-07-28 15:00:00**

## 프로젝트 구조

```
회원통합 모니터링/
├── config/
│   └── database.js          # 데이터베이스 연결 설정
├── models/
│   └── queries.js           # SQL 쿼리 정의
├── routes/
│   └── monitoring.js        # API 라우트
├── public/
│   └── index.html           # 웹 대시보드
├── server.js                # Express 서버
├── package.json             # 프로젝트 설정
├── env.example              # 환경변수 예시
└── README.md               # 프로젝트 문서
```

## 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: HTML, CSS, JavaScript, Bootstrap
- **Timezone**: moment-timezone (KST/UTC 변환)

## 주의사항

- 모든 날짜는 KST(한국 표준시) 기준으로 입력하세요
- 시스템 내부에서 자동으로 UTC로 변환하여 데이터베이스 쿼리를 실행합니다
- 데이터베이스 연결 정보는 보안을 위해 `.env` 파일로 관리하세요 