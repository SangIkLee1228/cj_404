/**
 * 스냅빵 직원 POS — 상품 카탈로그 / AI 인식 Mock 데이터
 *
 * 빵 카탈로그(BREAD_CATALOG)는 "빵 목록.json"(class_index 0~91, 92종)을 그대로
 * 이식한 실제 뚜레쥬르 상품 데이터다. id는 뚜레쥬르 공식 상품 코드(prod_num)와
 * 동일하며, Supabase Storage("images" 버킷)의 실제 상품 사진과 id 기준으로
 * 매칭된다 — 상품명 문자열로 매칭하지 않는다(이름 표기가 소스마다 다를 수
 * 있기 때문). 이미지 URL 자체는 frontend/src/app/pos/supabase/productImages.js
 * 에서 계산한다(이 파일은 순수 데이터만 갖는다).
 *
 * price는 뚜레쥬르 실제 판매가를 조사해 채웠다. 정확한 실가격을 확인하지
 * 못한 상품은 ESTIMATED_PRICE_IDS에 id를 남겨두었고, 값은 같은 카테고리
 * 실가격들의 평균으로 근사했다 — 실제 매장가가 확인되면 교체가 필요하다.
 *
 * 음료 카탈로그(DRINK_CATALOG)는 이번 작업 대상이 아니며 기존 Mock 그대로다.
 */

const rawBreadCatalog = [
  {
    id: '2523',
    name: '호박 패스트리 식빵',
    category: '식빵',
    price: 6900,
    classIndex: 0,
    imageFolder: 'bread',
    imageFile: '2523.jpg',
    emoji: '🍞',
  },
  {
    id: '3603',
    name: '고메 버터 식빵',
    category: '식빵',
    price: 6000,
    classIndex: 1,
    imageFolder: 'bread',
    imageFile: '3603.jpg',
    emoji: '🍞',
  },
  {
    id: '3888',
    name: 'TLJ 옥수수 듬뿍 옥수수식빵',
    category: '식빵',
    price: 5700,
    classIndex: 2,
    imageFolder: 'bread',
    imageFile: '3888.jpg',
    emoji: '🍞',
  },
  {
    id: '4436',
    name: '촉촉 쫄깃 탕종식빵',
    category: '식빵',
    price: 5900,
    classIndex: 3,
    imageFolder: 'bread',
    imageFile: '4436.jpg',
    emoji: '🍞',
  },
  {
    id: '4635',
    name: '마구마구 밤식빵 대',
    category: '식빵',
    price: 7500,
    classIndex: 4,
    imageFolder: 'bread',
    imageFile: '4635.jpg',
    emoji: '🍞',
  },
  {
    id: '5098',
    name: '2배 더 진한 우유 식빵',
    category: '식빵',
    price: 5800,
    classIndex: 5,
    imageFolder: 'bread',
    imageFile: '5098.jpg',
    emoji: '🍞',
  },
  {
    id: '5467',
    name: '데일리 우유식빵',
    category: '식빵',
    price: 3900,
    classIndex: 6,
    imageFolder: 'bread',
    imageFile: '5467.jpg',
    emoji: '🍞',
  },
  {
    id: '5469',
    name: '그대로 구워먹는 꿀 토스트 식빵',
    category: '식빵',
    price: 5800,
    classIndex: 7,
    imageFolder: 'bread',
    imageFile: '5469.jpg',
    emoji: '🍞',
  },
  {
    id: '3911',
    name: '라우겐 2개입',
    category: '건강빵',
    price: 4400,
    classIndex: 8,
    imageFolder: 'health-bread',
    imageFile: '3911.jpg',
    emoji: '🥖',
  },
  {
    id: '3923',
    name: '연유 버터 라우겐',
    category: '건강빵',
    price: 4800,
    classIndex: 9,
    imageFolder: 'health-bread',
    imageFile: '3923.jpg',
    emoji: '🥖',
  },
  {
    id: '4044',
    name: '앙버터 라우겐',
    category: '건강빵',
    price: 4900,
    classIndex: 10,
    imageFolder: 'health-bread',
    imageFile: '4044.jpg',
    emoji: '🥖',
  },
  {
    id: '4791',
    name: '착한빵식 통밀빵',
    category: '건강빵',
    price: 4900,
    classIndex: 11,
    imageFolder: 'health-bread',
    imageFile: '4791.jpg',
    emoji: '🥖',
  },
  {
    id: '5122',
    name: '기본좋은 올리브베이글',
    category: '건강빵',
    price: 3300,
    classIndex: 12,
    imageFolder: 'health-bread',
    imageFile: '5122.jpg',
    emoji: '🥖',
  },
  {
    id: '5123',
    name: '기본좋은 쌀 베이글',
    category: '건강빵',
    price: 3200,
    classIndex: 13,
    imageFolder: 'health-bread',
    imageFile: '5123.jpg',
    emoji: '🥖',
  },
  {
    id: '5234',
    name: '프랑스 바게트',
    category: '건강빵',
    price: 4900,
    classIndex: 14,
    imageFolder: 'health-bread',
    imageFile: '5234.jpg',
    emoji: '🥖',
  },
  {
    id: '5235',
    name: '호두 바게트',
    category: '건강빵',
    price: 4400,
    classIndex: 15,
    imageFolder: 'health-bread',
    imageFile: '5235.jpg',
    emoji: '🥖',
  },
  {
    id: '5236',
    name: '호두 연유 바게트',
    category: '건강빵',
    price: 4900,
    classIndex: 16,
    imageFolder: 'health-bread',
    imageFile: '5236.jpg',
    emoji: '🥖',
  },
  {
    id: '5513',
    name: '더 진해진 마늘 퐁당 바게트',
    category: '건강빵',
    price: 4400,
    classIndex: 17,
    imageFolder: 'health-bread',
    imageFile: '5513.jpg',
    emoji: '🥖',
  },
  {
    id: '5556',
    name: '소시지 불고기 라우겐',
    category: '건강빵',
    price: 4400,
    classIndex: 18,
    imageFolder: 'health-bread',
    imageFile: '5556.jpg',
    emoji: '🥖',
  },
  {
    id: '5573',
    name: '더블 초코 바게트',
    category: '건강빵',
    price: 4400,
    classIndex: 19,
    imageFolder: 'health-bread',
    imageFile: '5573.png',
    emoji: '🥖',
  },
  {
    id: '1088',
    name: '카페 모카 크림빵 대',
    category: '간식빵',
    price: 3600,
    classIndex: 20,
    imageFolder: 'snack-bread',
    imageFile: '1088.jpg',
    emoji: '🥐',
  },
  {
    id: '1222',
    name: '미니 햄 치즈롤 10개입',
    category: '간식빵',
    price: 5000,
    classIndex: 21,
    imageFolder: 'snack-bread',
    imageFile: '1222.jpg',
    emoji: '🥐',
  },
  {
    id: '1240',
    name: '리얼 초코 소라빵',
    category: '간식빵',
    price: 3000,
    classIndex: 22,
    imageFolder: 'snack-bread',
    imageFile: '1240.jpg',
    emoji: '🥐',
  },
  {
    id: '1291',
    name: '땅콩크림소보로',
    category: '간식빵',
    price: 3600,
    classIndex: 23,
    imageFolder: 'snack-bread',
    imageFile: '1291.jpg',
    emoji: '🥐',
  },
  {
    id: '1315',
    name: '크림치즈월넛브레드',
    category: '간식빵',
    price: 6000,
    classIndex: 24,
    imageFolder: 'snack-bread',
    imageFile: '1315.jpg',
    emoji: '🥐',
  },
  {
    id: '1329',
    name: '한입 두입 미니 단팥빵',
    category: '간식빵',
    price: 3600,
    classIndex: 25,
    imageFolder: 'snack-bread',
    imageFile: '1329.jpg',
    emoji: '🥐',
  },
  {
    id: '1405',
    name: '겹겹이 밀크롤인',
    category: '간식빵',
    price: 3600,
    classIndex: 26,
    imageFolder: 'snack-bread',
    imageFile: '1405.jpg',
    emoji: '🥐',
  },
  {
    id: '1459',
    name: '진짜 고소한 땅콩크림빵',
    category: '간식빵',
    price: 2100,
    classIndex: 27,
    imageFolder: 'snack-bread',
    imageFile: '1459.jpg',
    emoji: '🥐',
  },
  {
    id: '1557',
    name: '미니치즈롤',
    category: '간식빵',
    price: 3600,
    classIndex: 28,
    imageFolder: 'snack-bread',
    imageFile: '1557.jpg',
    emoji: '🥐',
  },
  {
    id: '1733',
    name: '매직모카크림빵',
    category: '간식빵',
    price: 6700,
    classIndex: 29,
    imageFolder: 'snack-bread',
    imageFile: '1733.jpg',
    emoji: '🥐',
  },
  {
    id: '1780',
    name: '순수한맛 순우유롤 봉',
    category: '간식빵',
    price: 5600,
    classIndex: 30,
    imageFolder: 'snack-bread',
    imageFile: '1780.jpg',
    emoji: '🥐',
  },
  {
    id: '2020',
    name: '겹겹이 치즈스틱 6개입',
    category: '간식빵',
    price: 3600,
    classIndex: 31,
    imageFolder: 'snack-bread',
    imageFile: '2020.jpg',
    emoji: '🥐',
  },
  {
    id: '2889',
    name: '폭신폭신 모닝롤',
    category: '간식빵',
    price: 3600,
    classIndex: 32,
    imageFolder: 'snack-bread',
    imageFile: '2889.jpg',
    emoji: '🥐',
  },
  {
    id: '3080',
    name: '후레쉬 크림빵',
    category: '간식빵',
    price: 2100,
    classIndex: 33,
    imageFolder: 'snack-bread',
    imageFile: '3080.jpg',
    emoji: '🥐',
  },
  {
    id: '3569',
    name: '카페모카빵 소',
    category: '간식빵',
    price: 3800,
    classIndex: 34,
    imageFolder: 'snack-bread',
    imageFile: '3569.jpg',
    emoji: '🥐',
  },
  {
    id: '3799',
    name: 'NEW 고소한 후랑크 소시지',
    category: '간식빵',
    price: 3600,
    classIndex: 35,
    imageFolder: 'snack-bread',
    imageFile: '3799.jpg',
    emoji: '🥐',
  },
  {
    id: '3800',
    name: 'NEW 어니언 소시지 포카치아',
    category: '간식빵',
    price: 3100,
    classIndex: 36,
    imageFolder: 'snack-bread',
    imageFile: '3800.jpg',
    emoji: '🥐',
  },
  {
    id: '3952',
    name: '피자 바게트',
    category: '간식빵',
    price: 4900,
    classIndex: 37,
    imageFolder: 'snack-bread',
    imageFile: '3952.jpg',
    emoji: '🥐',
  },
  {
    id: '4046',
    name: '치즈 방앗간',
    category: '간식빵',
    price: 4500,
    classIndex: 38,
    imageFolder: 'snack-bread',
    imageFile: '4046.jpg',
    emoji: '🥐',
  },
  {
    id: '4049',
    name: '달콩 찹쌀 브레드',
    category: '간식빵',
    price: 4700,
    classIndex: 39,
    imageFolder: 'snack-bread',
    imageFile: '4049.jpg',
    emoji: '🥐',
  },
  {
    id: '4162',
    name: '러스크가 달구나',
    category: '간식빵',
    price: 3600,
    classIndex: 40,
    imageFolder: 'snack-bread',
    imageFile: '4162.jpg',
    emoji: '🥐',
  },
  {
    id: '4201',
    name: '쏙쏙 토스트',
    category: '간식빵',
    price: 3600,
    classIndex: 41,
    imageFolder: 'snack-bread',
    imageFile: '4201.jpg',
    emoji: '🥐',
  },
  {
    id: '4222',
    name: '새우오믈렛 토스트',
    category: '간식빵',
    price: 3600,
    classIndex: 42,
    imageFolder: 'snack-bread',
    imageFile: '4222.jpg',
    emoji: '🥐',
  },
  {
    id: '4241',
    name: '마담 얼그레이 크림번',
    category: '간식빵',
    price: 3800,
    classIndex: 43,
    imageFolder: 'snack-bread',
    imageFile: '4241.jpg',
    emoji: '🥐',
  },
  {
    id: '4347',
    name: '폭신폭신 우유브레드',
    category: '간식빵',
    price: 3600,
    classIndex: 44,
    imageFolder: 'snack-bread',
    imageFile: '4347.jpg',
    emoji: '🥐',
  },
  {
    id: '44',
    name: '완두앙금빵',
    category: '간식빵',
    price: 2100,
    classIndex: 45,
    imageFolder: 'snack-bread',
    imageFile: '44.jpg',
    emoji: '🥐',
  },
  {
    id: '4521',
    name: '소금버터롤',
    category: '간식빵',
    price: 2800,
    classIndex: 46,
    imageFolder: 'snack-bread',
    imageFile: '4521.jpg',
    emoji: '🥐',
  },
  {
    id: '45',
    name: '까까웨뜨',
    category: '간식빵',
    price: 3600,
    classIndex: 47,
    imageFolder: 'snack-bread',
    imageFile: '45.jpg',
    emoji: '🥐',
  },
  {
    id: '4688',
    name: '오리지널 커피번',
    category: '간식빵',
    price: 3300,
    classIndex: 48,
    imageFolder: 'snack-bread',
    imageFile: '4688.jpg',
    emoji: '🥐',
  },
  {
    id: '46',
    name: '깨찰빵',
    category: '간식빵',
    price: 3600,
    classIndex: 49,
    imageFolder: 'snack-bread',
    imageFile: '46.jpg',
    emoji: '🥐',
  },
  {
    id: '4911',
    name: '뚜쥬맘 계란 토스트',
    category: '간식빵',
    price: 6900,
    classIndex: 50,
    imageFolder: 'snack-bread',
    imageFile: '4911.jpg',
    emoji: '🥐',
  },
  {
    id: '5020',
    name: '생크림 소보로',
    category: '간식빵',
    price: 3600,
    classIndex: 51,
    imageFolder: 'snack-bread',
    imageFile: '5020.jpg',
    emoji: '🥐',
  },
  {
    id: '5021',
    name: '크로크무슈',
    category: '간식빵',
    price: 3300,
    classIndex: 52,
    imageFolder: 'snack-bread',
    imageFile: '5021.jpg',
    emoji: '🥐',
  },
  {
    id: '5022',
    name: '그냥 먹어도 맛있는 햄야채롤 6개입',
    category: '간식빵',
    price: 4500,
    classIndex: 53,
    imageFolder: 'snack-bread',
    imageFile: '5022.png',
    emoji: '🥐',
  },
  {
    id: '5131',
    name: '앙버터 소금버터롤',
    category: '간식빵',
    price: 2800,
    classIndex: 54,
    imageFolder: 'snack-bread',
    imageFile: '5131.jpg',
    emoji: '🥐',
  },
  {
    id: '5298',
    name: '신선해 고소해 후레쉬크림빵',
    category: '간식빵',
    price: 2100,
    classIndex: 55,
    imageFolder: 'snack-bread',
    imageFile: '5298.jpg',
    emoji: '🥐',
  },
  {
    id: '5321',
    name: '슬로우 오트 모닝롤',
    category: '간식빵',
    price: 3600,
    classIndex: 56,
    imageFolder: 'snack-bread',
    imageFile: '5321.jpg',
    emoji: '🥐',
  },
  {
    id: '534',
    name: '슈크림빵',
    category: '간식빵',
    price: 2100,
    classIndex: 57,
    imageFolder: 'snack-bread',
    imageFile: '534.jpg',
    emoji: '🥐',
  },
  {
    id: '5477',
    name: '더 촉촉해진 연유 퐁당 밀크브레드',
    category: '간식빵',
    price: 6000,
    classIndex: 58,
    imageFolder: 'snack-bread',
    imageFile: '5477.jpg',
    emoji: '🥐',
  },
  {
    id: '5495',
    name: '팥이 빵빵 단팥빵',
    category: '간식빵',
    price: 2100,
    classIndex: 59,
    imageFolder: 'snack-bread',
    imageFile: '5495.jpg',
    emoji: '🥐',
  },
  {
    id: '5496',
    name: '맛보로 소보로빵',
    category: '간식빵',
    price: 2100,
    classIndex: 60,
    imageFolder: 'snack-bread',
    imageFile: '5496.jpg',
    emoji: '🥐',
  },
  {
    id: '5498',
    name: '크림듬뿍 슈크림빵',
    category: '간식빵',
    price: 2100,
    classIndex: 61,
    imageFolder: 'snack-bread',
    imageFile: '5498.jpg',
    emoji: '🥐',
  },
  {
    id: '54',
    name: '카페 모카 크림빵 소',
    category: '간식빵',
    price: 3800,
    classIndex: 62,
    imageFolder: 'snack-bread',
    imageFile: '54.jpg',
    emoji: '🥐',
  },
  {
    id: '5525',
    name: '부드러운 후레쉬크림 샌드빵',
    category: '간식빵',
    price: 3600,
    classIndex: 63,
    imageFolder: 'snack-bread',
    imageFile: '5525.jpg',
    emoji: '🥐',
  },
  {
    id: '5528',
    name: '낙엽 소시지 브레드',
    category: '간식빵',
    price: 3500,
    classIndex: 64,
    imageFolder: 'snack-bread',
    imageFile: '5528.jpg',
    emoji: '🥐',
  },
  {
    id: '5535',
    name: '포키와 캐런의 우유 스틱 브레드',
    category: '간식빵',
    price: 3600,
    classIndex: 65,
    imageFolder: 'snack-bread',
    imageFile: '5535.jpg',
    emoji: '🥐',
  },
  {
    id: '5536',
    name: '버즈와 함께 출동 완두앙금빵',
    category: '간식빵',
    price: 2100,
    classIndex: 66,
    imageFolder: 'snack-bread',
    imageFile: '5536.jpg',
    emoji: '🥐',
  },
  {
    id: '5571',
    name: '오지치즈 포테이토 포카치아',
    category: '간식빵',
    price: 3600,
    classIndex: 67,
    imageFolder: 'snack-bread',
    imageFile: '5571.jpg',
    emoji: '🥐',
  },
  {
    id: '5572',
    name: '감바스 포카치아',
    category: '간식빵',
    price: 3600,
    classIndex: 68,
    imageFolder: 'snack-bread',
    imageFile: '5572.png',
    emoji: '🥐',
  },
  {
    id: '59',
    name: '소보로빵',
    category: '간식빵',
    price: 2100,
    classIndex: 69,
    imageFolder: 'snack-bread',
    imageFile: '59.jpg',
    emoji: '🥐',
  },
  {
    id: '854',
    name: '피자토스트',
    category: '간식빵',
    price: 2800,
    classIndex: 70,
    imageFolder: 'snack-bread',
    imageFile: '854.jpg',
    emoji: '🥐',
  },
  {
    id: '941',
    name: '카페모카빵 대',
    category: '간식빵',
    price: 3600,
    classIndex: 71,
    imageFolder: 'snack-bread',
    imageFile: '941.jpg',
    emoji: '🥐',
  },
  {
    id: '1478',
    name: '크림코르네',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 72,
    imageFolder: 'pie-pastry',
    imageFile: '1478.jpg',
    emoji: '🥧',
  },
  {
    id: '3557',
    name: '오리지널 크라상',
    category: '파이/페이스트리',
    price: 2800,
    classIndex: 73,
    imageFolder: 'pie-pastry',
    imageFile: '3557.jpg',
    emoji: '🥧',
  },
  {
    id: '3559',
    name: '아몬드 크라상',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 74,
    imageFolder: 'pie-pastry',
    imageFile: '3559.jpg',
    emoji: '🥧',
  },
  {
    id: '3566',
    name: '오리지널 생크림 크라상',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 75,
    imageFolder: 'pie-pastry',
    imageFile: '3566.jpg',
    emoji: '🥧',
  },
  {
    id: '3778',
    name: '바통쉬크레',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 76,
    imageFolder: 'pie-pastry',
    imageFile: '3778.jpg',
    emoji: '🥧',
  },
  {
    id: '3798',
    name: '카라멜 러스크',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 77,
    imageFolder: 'pie-pastry',
    imageFile: '3798.jpg',
    emoji: '🥧',
  },
  {
    id: '4081',
    name: '몽블랑의 정석',
    category: '파이/페이스트리',
    price: 6300,
    classIndex: 78,
    imageFolder: 'pie-pastry',
    imageFile: '4081.jpg',
    emoji: '🥧',
  },
  {
    id: '4188',
    name: '겹겹이 연유크림 데니쉬',
    category: '파이/페이스트리',
    price: 5400,
    classIndex: 79,
    imageFolder: 'pie-pastry',
    imageFile: '4188.jpg',
    emoji: '🥧',
  },
  {
    id: '4189',
    name: '겹겹이 데니쉬',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 80,
    imageFolder: 'pie-pastry',
    imageFile: '4189.jpg',
    emoji: '🥧',
  },
  {
    id: '4891',
    name: '카라멜 애플파이',
    category: '파이/페이스트리',
    price: 3400,
    classIndex: 81,
    imageFolder: 'pie-pastry',
    imageFile: '4891.png',
    emoji: '🥧',
  },
  {
    id: '5569',
    name: '한 입 햄치즈 패스트리 4개입',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 82,
    imageFolder: 'pie-pastry',
    imageFile: '5569.jpg',
    emoji: '🥧',
  },
  {
    id: '5570',
    name: '한 입 햄치즈 패스트리 1개입',
    category: '파이/페이스트리',
    price: 4500,
    classIndex: 83,
    imageFolder: 'pie-pastry',
    imageFile: '5570.jpg',
    emoji: '🥧',
  },
  {
    id: '1807',
    name: '추억의 사라다 고로케',
    category: '도넛/고로케',
    price: 3800,
    classIndex: 84,
    imageFolder: 'donut-croquette',
    imageFile: '1807.jpg',
    emoji: '🍩',
  },
  {
    id: '2691',
    name: '초코 마카롱 도넛',
    category: '도넛/고로케',
    price: 2500,
    classIndex: 85,
    imageFolder: 'donut-croquette',
    imageFile: '2691.jpg',
    emoji: '🍩',
  },
  {
    id: '2692',
    name: '딸기 마카롱 도넛',
    category: '도넛/고로케',
    price: 2500,
    classIndex: 86,
    imageFolder: 'donut-croquette',
    imageFile: '2692.jpg',
    emoji: '🍩',
  },
  {
    id: '4171',
    name: '옛날 꽈배기 도넛',
    category: '도넛/고로케',
    price: 2100,
    classIndex: 87,
    imageFolder: 'donut-croquette',
    imageFile: '4171.jpg',
    emoji: '🍩',
  },
  {
    id: '5238',
    name: '더 쫄깃해진 그때 그 도나쓰 5개입',
    category: '도넛/고로케',
    price: 2900,
    classIndex: 88,
    imageFolder: 'donut-croquette',
    imageFile: '5238.jpg',
    emoji: '🍩',
  },
  {
    id: '5248',
    name: '조청 왕꽈배기',
    category: '도넛/고로케',
    price: 3500,
    classIndex: 89,
    imageFolder: 'donut-croquette',
    imageFile: '5248.jpg',
    emoji: '🍩',
  },
  {
    id: '848',
    name: '슈거 글레이즈 도넛',
    category: '도넛/고로케',
    price: 2500,
    classIndex: 90,
    imageFolder: 'donut-croquette',
    imageFile: '848.jpg',
    emoji: '🍩',
  },
  {
    id: '3879',
    name: '김치 고로케',
    category: '도넛/고로케',
    price: 3200,
    classIndex: 91,
    imageFolder: 'donut-croquette',
    imageFile: '3879.png',
    emoji: '🍩',
  },
];

/**
 * 실가격을 확인하지 못해 같은 카테고리 실가격 평균으로 근사한 상품의 id
 * 목록이다(36종). 확인되는 대로 rawBreadCatalog의 해당 price를 교체한다.
 */
export const ESTIMATED_PRICE_IDS = [
  '4436',
  '3911',
  '5235',
  '5513',
  '5556',
  '5573',
  '1088',
  '1291',
  '1329',
  '1405',
  '1557',
  '2020',
  '2889',
  '3799',
  '4162',
  '4201',
  '4222',
  '4347',
  '45',
  '46',
  '5020',
  '5321',
  '5525',
  '5535',
  '5571',
  '5572',
  '941',
  '1478',
  '3559',
  '3566',
  '3778',
  '3798',
  '4189',
  '5569',
  '5570',
  '5238',
];

const rawDrinkCatalog = [
  { name: '아이스 아메리카노', price: 3500, category: '커피', emoji: '☕' },
  { name: '카페라떼', price: 4000, category: '커피', emoji: '☕' },
  { name: '바닐라 라떼', price: 4500, category: '커피', emoji: '☕' },
  { name: '카푸치노', price: 4200, category: '커피', emoji: '☕' },
  { name: '콜드브루', price: 4300, category: '커피', emoji: '🥤' },
  { name: '유자차', price: 3800, category: '티', emoji: '🍵' },
  { name: '얼그레이티', price: 3500, category: '티', emoji: '🍵' },
  { name: '복숭아 아이스티', price: 3500, category: '티', emoji: '🥤' },
  {
    name: '오렌지 주스',
    price: 4000,
    category: '에이드/주스',
    subCategory: '주스',
    emoji: '🧃',
  },
  {
    name: '자몽에이드',
    price: 4500,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '레몬에이드',
    price: 4300,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '청포도에이드',
    price: 4500,
    category: '에이드/주스',
    subCategory: '에이드',
    emoji: '🥤',
  },
  {
    name: '딸기우유',
    price: 3000,
    category: '우유/기타',
    subCategory: '우유',
    emoji: '🥛',
  },
  {
    name: '흰우유',
    price: 2000,
    category: '우유/기타',
    subCategory: '우유',
    emoji: '🥛',
  },
  {
    name: '생수',
    price: 1500,
    category: '우유/기타',
    subCategory: '기타',
    emoji: '💧',
  },
];

function withIds(items, prefix, productType) {
  return items.map((item, i) => ({
    ...item,
    productId: `${prefix}${String(i + 1).padStart(3, '0')}`,
    productType,
  }));
}

function withBreadIds(items) {
  return items.map((item) => ({
    ...item,
    productId: item.id,
    productType: 'BREAD',
  }));
}

export const BREAD_CATALOG = withBreadIds(rawBreadCatalog);
export const DRINK_CATALOG = withIds(rawDrinkCatalog, 'D', 'DRINK');
export const ALL_PRODUCTS = [...BREAD_CATALOG, ...DRINK_CATALOG];

export const BREAD_CATEGORIES = [
  '전체',
  '식빵',
  '건강빵',
  '간식빵',
  '파이/페이스트리',
  '도넛/고로케',
];
export const DRINK_CATEGORIES = [
  '전체',
  '커피',
  '티',
  '에이드/주스',
  '우유/기타',
];

export function findProductByName(name) {
  return ALL_PRODUCTS.find((p) => p.name === name) || null;
}

/** id(=productId) 기준 조회. 이미지 매칭·AI 학습 대상 판정은 반드시 이 함수를 쓴다. */
export function findProductById(productId) {
  return ALL_PRODUCTS.find((p) => p.productId === productId) || null;
}

/**
 * 복합 카테고리("A/B" 형태) 내부에서 상품군끼리 섞이지 않도록 하는 표시 순서.
 * 필터 UI(BREAD_CATEGORIES/DRINK_CATEGORIES)는 그대로 "도넛/고로케" 등
 * 하나의 필터로 유지하고, 그 안에서 카드가 그려지는 순서만 이 표에 따라 정한다.
 * 빵(BREAD_CATALOG)은 더 이상 subCategory를 쓰지 않는다 — "빵 목록.json"의
 * class_index가 이미 원하는 전체 순서를 제공하므로, 원본 배열 순서(=class_index
 * 오름차순)를 그대로 stable sort로 보존한다. 이 표는 음료(에이드/주스,
 * 우유/기타)에만 실질적으로 적용된다.
 */
export const SUBCATEGORY_ORDER = {
  '파이/페이스트리': ['파이', '페이스트리'],
  '도넛/고로케': ['도넛', '고로케'],
  '에이드/주스': ['에이드', '주스'],
  '우유/기타': ['우유', '기타'],
};

function subCategoryRank(product) {
  const order = SUBCATEGORY_ORDER[product.category];
  if (!order || !product.subCategory) return 0;
  const idx = order.indexOf(product.subCategory);
  return idx === -1 ? order.length : idx;
}

/**
 * 카테고리(categoryOrder) → 카테고리 내부 subCategory(SUBCATEGORY_ORDER) 순으로
 * 정렬한다. 같은 subCategory 안에서는 원본 배열 순서를 그대로 유지한다
 * (Array.prototype.sort는 안정 정렬이므로 동률 항목의 상대 순서가 보존된다).
 * subCategory가 없는 상품/카테고리는 영향 없이 원래 자리를 유지한다.
 */
export function sortForDisplay(products, categoryOrder) {
  const categoryRank = new Map(categoryOrder.map((c, i) => [c, i]));
  return [...products].sort((a, b) => {
    const ca = categoryRank.has(a.category)
      ? categoryRank.get(a.category)
      : categoryOrder.length;
    const cb = categoryRank.has(b.category)
      ? categoryRank.get(b.category)
      : categoryOrder.length;
    if (ca !== cb) return ca - cb;
    return subCategoryRank(a) - subCategoryRank(b);
  });
}

/**
 * 실제 AI가 학습·인식 가능한 상품은 이 6종뿐이다 — 카탈로그 전체 상품과는
 * 별개 개념이다("카탈로그 전체 상품" vs "AI 인식 대상"). 상품명이 아니라
 * 뚜레쥬르 상품 id(=productId)를 기준 키로 관리한다 — 표시명이 데이터 갱신
 * 과정에서 바뀌어도(예: 이름 표기 차이) 대상 판정이 깨지지 않게 하기 위함이다.
 * AI 인식 Mock(MOCK_BASIC_CAPTURE 등)은 반드시 이 id 목록 안에서만 구성한다.
 */
export const AI_TRAINED_PRODUCT_IDS = [
  '2692', // 딸기 마카롱 도넛
  '4171', // 옛날 꽈배기 도넛
  '5495', // 팥이 빵빵 단팥빵
  '3879', // 김치 고로케
  '1240', // 리얼 초코 소라빵
  '5122', // 기본좋은 올리브베이글
];

export const AI_TRAINED_PRODUCTS = AI_TRAINED_PRODUCT_IDS.map((id) =>
  findProductById(id)
).filter(Boolean);

export const AI_TRAINED_PRODUCT_NAMES = AI_TRAINED_PRODUCTS.map((p) => p.name);

/**
 * Mock 재고(추정치). 실제 재고 API 연동 전까지 사용하며,
 * 매장 대시보드가 재고 0으로 관리 중인 상품을 흉내낸 매진 케이스를 일부 포함한다.
 */
export const MOCK_INVENTORY_BY_NAME = {
  흰우유: 0,
  '촉촉 쫄깃 탕종식빵': 0,
  '한입 두입 미니 단팥빵': 4,
  '아몬드 크라상': 6,
  '더 쫄깃해진 그때 그 도나쓰 5개입': 5,
};

/**
 * CJ ONE 조회 실패 Mock 케이스 — 미등록 회원 시뮬레이션 전용 데모 번호.
 * 실제 회원 조회 API가 없으므로, 이 번호를 입력했을 때만 "조회 실패" 상태를
 * 재현한다(개발자용 테스트 버튼을 UI에 두지 않기 위한 최소한의 장치).
 */
export const MOCK_UNREGISTERED_PHONE = '01000000000';

/** Mock 금일 판매 수량 — "오늘의 인기 상품 TOP3" 산출에 사용한다. */
export const MOCK_SOLD_TODAY_BY_NAME = {
  '데일리 우유식빵': 42,
  '팥이 빵빵 단팥빵': 38,
  '오리지널 크라상': 31,
  슈크림빵: 27,
  '옛날 꽈배기 도넛': 20,
  '기본좋은 쌀 베이글': 18,
  소보로빵: 12,
  '프랑스 바게트': 9,
};

/**
 * AI 인식 Mock 항목 생성 헬퍼 — id로 카탈로그(findProductById)를 조회해
 * name/price를 가져온다. 카탈로그와 캡처 Mock의 이름·가격이 어긋나지 않는다.
 * belowThreshold: 실제 연동 시 backend가 계산해 내려주는 boolean(백엔드
 * scan 스키마의 is_below_threshold와 동일 계약)을 흉내낸 값이다. 프론트에서
 * confidence 숫자로 임계값을 임의 판정하지 않고, 이미 계산된 결과만 받는다는
 * 전제를 목업에서도 그대로 유지한다.
 */
function aiCaptureItem(id, qty, confidence, belowThreshold = false) {
  const product = findProductById(id);
  return {
    name: product.name,
    price: product.price,
    qty,
    confidence,
    source: 'ai',
    belowThreshold,
  };
}

/** 기본 촬영 AI 인식 Mock 결과 — AI 학습 대상 6종(AI_TRAINED_PRODUCT_IDS) 안에서만 구성한다. */
export const MOCK_BASIC_CAPTURE = [
  aiCaptureItem('2692', 1, 97), // 딸기 마카롱 도넛
  aiCaptureItem('5495', 2, 95), // 팥이 빵빵 단팥빵
  aiCaptureItem('3879', 1, 93, true), // 김치 고로케 (확인 필요)
];

/**
 * 추가 촬영 AI 인식 Mock 결과 — 기존 계산 항목은 유지하고 이 결과만 누적한다.
 * 팥이 빵빵 단팥빵을 기본 촬영과 겹치게 두어 동일 상품 합산이 실제로 확인되게 한다.
 */
export const MOCK_ADD_CAPTURE = [
  aiCaptureItem('5495', 1, 96), // 팥이 빵빵 단팥빵
  aiCaptureItem('4171', 1, 94), // 옛날 꽈배기 도넛
];

/** 다시 촬영 AI 인식 Mock 결과 — 기존 AI 인식 결과를 이 결과로 교체한다(직접 추가 항목은 유지). */
export const MOCK_RETAKE_CAPTURE = [
  aiCaptureItem('2692', 2, 99), // 딸기 마카롱 도넛
  aiCaptureItem('1240', 1, 97), // 리얼 초코 소라빵
  aiCaptureItem('5122', 1, 95), // 기본좋은 올리브베이글
];

/**
 * 트레이 내 바운딩 박스 표시 위치(Mock, 트레이 영역 기준 비율).
 * 실제 AI 이미지 좌표로 교체될 자리 — 최대 3개까지만 동시에 표시한다.
 */
export const MOCK_BBOX_SLOTS = [
  { left: '7.5%', top: 'calc(52% - 53px)', width: '188px', height: '106px' },
  {
    left: 'calc(50% - 90px)',
    top: 'calc(52% - 51px)',
    width: '180px',
    height: '102px',
  },
  { right: '7.5%', top: 'calc(52% - 54px)', width: '194px', height: '108px' },
];
