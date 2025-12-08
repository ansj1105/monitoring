const express = require('express');
const router = express.Router();
const GoogleSheetsService = require('../services/sheets');
const pool = require('../config/database');
const { queries } = require('../models/queries');
const cron = require('node-cron');

const sheetsService = new GoogleSheetsService();

// Google Sheets 헤더 설정
router.post('/setup-headers', async (req, res) => {
  try {
    await sheetsService.setupHeaders();
    res.json({ message: 'Google Sheets 헤더 설정 완료' });
  } catch (error) {
    console.error('헤더 설정 실패:', error);
    res.status(500).json({ error: '헤더 설정 중 오류가 발생했습니다.' });
  }
});



// 일별 데이터를 Google Sheets에 업데이트
router.post('/update-daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // 데이터베이스에서 일별 데이터 조회
    const query = queries.getDailyIntegrationData(date);
    const result = await pool.query(query.text, query.values);
    
    // Google Sheets에 업데이트 (중복 방지 로직 포함)
    await sheetsService.updateDailyData(date, result.rows[0] || {
      total_integrated_users: 0,
      new_integrated_users: 0,
      converted_integrated_users: 0,
      physical_card_requests: 0,
      online_auto_issued_cards: 0
    });

    res.json({ message: `${date} 데이터 업데이트 완료` });
  } catch (error) {
    console.error('일별 데이터 업데이트 실패:', error);
    res.status(500).json({ error: '데이터 업데이트 중 오류가 발생했습니다.' });
  }
});

// 기간별 데이터를 Google Sheets에 업데이트
router.post('/update-period', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '시작일과 종료일을 입력해주세요.' });
    }

    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    const results = [];
    const skippedDates = [];

    while (currentDate <= endDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      try {
        // 데이터베이스에서 일별 데이터 조회 (재시도 로직 포함)
        const query = queries.getDailyIntegrationData(dateStr);
        
        let result;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            result = await pool.query(query.text, query.values);
            break; // 성공하면 루프 종료
          } catch (dbError) {
            retryCount++;
            console.log(`기간별 업데이트 - ${dateStr} 데이터베이스 연결 시도 ${retryCount}/${maxRetries} 실패:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              throw dbError; // 최대 재시도 횟수 초과시 에러 던지기
            }
            
            // 5초 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        // Google Sheets에 업데이트 (중복 방지 로직 포함)
        await sheetsService.updateDailyData(dateStr, result.rows[0] || {
          total_integrated_users: 0,
          new_integrated_users: 0,
          converted_integrated_users: 0,
          physical_card_requests: 0,
          online_auto_issued_cards: 0
        });

        results.push(dateStr);
      } catch (error) {
        // 중복으로 인한 건너뛰기인 경우
        if (error.message && error.message.includes('이미 업데이트되었습니다')) {
          skippedDates.push(dateStr);
        } else {
          console.error(`${dateStr} 업데이트 실패:`, error);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({ 
      message: `${startDate} ~ ${endDate} 기간 데이터 업데이트 완료`,
      dates: results,
      skippedDates: skippedDates
    });
  } catch (error) {
    console.error('기간별 데이터 업데이트 실패:', error);
    res.status(500).json({ error: '데이터 업데이트 중 오류가 발생했습니다.' });
  }
});

// 자동 업데이트 스케줄러
let autoUpdateJob = null;
let dailyCheckJob = null;

// 자동 업데이트 시작
router.post('/start-auto-update', (req, res) => {
  try {
    if (autoUpdateJob) {
      return res.json({ message: '자동 업데이트가 이미 실행 중입니다.' });
    }
    
    // 매시간 39분에 실행 (오늘 데이터 업데이트)
    autoUpdateJob = cron.schedule('59 */1 * * *', async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      console.log(`=== 자동 업데이트 시작 (오늘 데이터) ===`);
      console.log(`업데이트 날짜: ${todayStr}`);
      console.log(`실행 시간: ${now.toLocaleTimeString()}`);
      console.log(`타임스탬프: ${now.toISOString()}`);
      
      try {
        const query = queries.getDailyIntegrationData(todayStr);
        console.log(`쿼리 실행: ${query.text}`);
        console.log(`쿼리 파라미터:`, query.values);
        
        // 데이터베이스 연결 재시도 로직 (최대 3회)
        let result;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            result = await pool.query(query.text, query.values);
            console.log(`데이터베이스 결과:`, result.rows[0]);
            break; // 성공하면 루프 종료
          } catch (dbError) {
            retryCount++;
            console.log(`데이터베이스 연결 시도 ${retryCount}/${maxRetries} 실패:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              throw dbError; // 최대 재시도 횟수 초과시 에러 던지기
            }
            
            // 5초 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        const dataToUpdate = result.rows[0] || {
          total_integrated_users: 0,
          new_integrated_users: 0,
          converted_integrated_users: 0,
          physical_card_requests: 0,
          online_auto_issued_cards: 0
        };
        
        console.log(`업데이트할 데이터:`, dataToUpdate);
        
        await sheetsService.updateDailyData(todayStr, dataToUpdate);
        
        console.log(`=== 자동 업데이트 완료 (오늘 데이터) ===`);
        console.log(`업데이트 날짜: ${todayStr}`);
        console.log(`실행 시간: ${now.toLocaleTimeString()}`);
        console.log(`========================`);
      } catch (error) {
        console.error(`=== 자동 업데이트 실패 (오늘 데이터) ===`);
        console.error(`업데이트 날짜: ${todayStr}`);
        console.error(`실행 시간: ${now.toLocaleTimeString()}`);
        console.error(`에러:`, error);
        console.error(`========================`);
      }
    });

    // 매일 1시에 전날 데이터 점검 및 재업데이트
    dailyCheckJob = cron.schedule('0 1 * * *', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      console.log(`=== 전날 데이터 점검 시작 ===`);
      console.log(`점검 날짜: ${yesterdayStr} (전날)`);
      console.log(`실행 시간: ${now.toLocaleTimeString()}`);
      console.log(`타임스탬프: ${now.toISOString()}`);
      
      try {
        const query = queries.getDailyIntegrationData(yesterdayStr);
        console.log(`쿼리 실행: ${query.text}`);
        console.log(`쿼리 파라미터:`, query.values);
        
        // 데이터베이스 연결 재시도 로직 (최대 3회)
        let result;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            result = await pool.query(query.text, query.values);
            console.log(`데이터베이스 결과:`, result.rows[0]);
            break; // 성공하면 루프 종료
          } catch (dbError) {
            retryCount++;
            console.log(`데이터베이스 연결 시도 ${retryCount}/${maxRetries} 실패:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              throw dbError; // 최대 재시도 횟수 초과시 에러 던지기
            }
            
            // 5초 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        const dataToUpdate = result.rows[0] || {
          total_integrated_users: 0,
          new_integrated_users: 0,
          converted_integrated_users: 0,
          physical_card_requests: 0,
          online_auto_issued_cards: 0
        };
        
        console.log(`점검 후 업데이트할 데이터:`, dataToUpdate);
        
        await sheetsService.updateDailyData(yesterdayStr, dataToUpdate);
        
        console.log(`=== 전날 데이터 점검 완료 ===`);
        console.log(`점검 날짜: ${yesterdayStr} (전날)`);
        console.log(`실행 시간: ${now.toLocaleTimeString()}`);
        console.log(`========================`);
      } catch (error) {
        console.error(`=== 전날 데이터 점검 실패 ===`);
        console.error(`점검 날짜: ${yesterdayStr} (전날)`);
        console.error(`실행 시간: ${now.toLocaleTimeString()}`);
        console.error(`에러:`, error);
        console.error(`========================`);
      }
    });

    res.json({ message: '자동 업데이트가 시작되었습니다. (매시간 39분에 오늘 데이터 업데이트, 매일 1시에 전날 데이터 점검)' });
  } catch (error) {
    console.error('자동 업데이트 시작 실패:', error);
    res.status(500).json({ error: '자동 업데이트 시작 중 오류가 발생했습니다.' });
  }
});

// 자동 업데이트 상태 확인
router.get('/auto-update-status', (req, res) => {
  try {
    const isRunning = autoUpdateJob !== null || dailyCheckJob !== null;
    const now = new Date();
    const nextHourlyRun = autoUpdateJob ? 
      `다음 시간별 실행: ${now.getHours()}:39 (${now.getMinutes() >= 39 ? '내일' : '오늘'})` : 
      '시간별 업데이트 중지됨';
    const nextDailyRun = dailyCheckJob ? 
      `다음 일별 점검: 내일 01:00` : 
      '일별 점검 중지됨';
    
    res.json({ 
      isRunning: isRunning,
      message: isRunning ? '자동 업데이트가 실행 중입니다.' : '자동 업데이트가 중지되었습니다.',
      schedule: '매시간 39분에 오늘 데이터 업데이트, 매일 1시에 전날 데이터 점검',
      nextHourlyRun: nextHourlyRun,
      nextDailyRun: nextDailyRun,
      currentTime: now.toLocaleString()
    });
  } catch (error) {
    console.error('자동 업데이트 상태 확인 실패:', error);
    res.status(500).json({ error: '상태 확인 중 오류가 발생했습니다.' });
  }
});

// 즉시 업데이트 실행 (수동)
router.post('/update-now', async (req, res) => {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    console.log(`수동 업데이트 시작: ${dateStr} ${now.toLocaleTimeString()}`);
    
    const query = queries.getDailyIntegrationData(dateStr);
    
    // 데이터베이스 연결 재시도 로직 (최대 3회)
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        result = await pool.query(query.text, query.values);
        break; // 성공하면 루프 종료
      } catch (dbError) {
        retryCount++;
        console.log(`수동 업데이트 - 데이터베이스 연결 시도 ${retryCount}/${maxRetries} 실패:`, dbError.message);
        
        if (retryCount >= maxRetries) {
          throw dbError; // 최대 재시도 횟수 초과시 에러 던지기
        }
        
        // 5초 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    await sheetsService.updateDailyData(dateStr, result.rows[0] || {
      total_integrated_users: 0,
      new_integrated_users: 0,
      converted_integrated_users: 0,
      physical_card_requests: 0,
      online_auto_issued_cards: 0
    });

    console.log(`수동 업데이트 완료: ${dateStr} ${now.toLocaleTimeString()}`);
    res.json({ message: `즉시 업데이트 완료: ${dateStr} ${now.toLocaleTimeString()}` });
  } catch (error) {
    console.error('즉시 업데이트 실패:', error);
    res.status(500).json({ error: '즉시 업데이트 중 오류가 발생했습니다.' });
  }
});

// 특정 날짜 업데이트 실행 (테스트용)
router.post('/update-specific-date', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: '날짜를 입력해주세요. (YYYY-MM-DD 형식)' });
    }
    
    console.log(`특정 날짜 업데이트 시작: ${date}`);
    
    const query = queries.getDailyIntegrationData(date);
    
    // 데이터베이스 연결 재시도 로직 (최대 3회)
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        result = await pool.query(query.text, query.values);
        console.log(`데이터베이스 결과:`, result.rows[0]);
        break; // 성공하면 루프 종료
      } catch (dbError) {
        retryCount++;
        console.log(`특정 날짜 업데이트 - 데이터베이스 연결 시도 ${retryCount}/${maxRetries} 실패:`, dbError.message);
        
        if (retryCount >= maxRetries) {
          throw dbError; // 최대 재시도 횟수 초과시 에러 던지기
        }
        
        // 5초 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    const dataToUpdate = result.rows[0] || {
      total_integrated_users: 0,
      new_integrated_users: 0,
      converted_integrated_users: 0,
      physical_card_requests: 0,
      online_auto_issued_cards: 0
    };
    
    console.log(`업데이트할 데이터:`, dataToUpdate);
    
    await sheetsService.updateDailyData(date, dataToUpdate);

    console.log(`특정 날짜 업데이트 완료: ${date}`);
    res.json({ message: `특정 날짜 업데이트 완료: ${date}`, data: dataToUpdate });
  } catch (error) {
    console.error('특정 날짜 업데이트 실패:', error);
    res.status(500).json({ error: '특정 날짜 업데이트 중 오류가 발생했습니다.' });
  }
});

// 자동 업데이트 중지
router.post('/stop-auto-update', (req, res) => {
  try {
    if (!autoUpdateJob && !dailyCheckJob) {
      return res.json({ message: '자동 업데이트가 실행 중이지 않습니다.' });
    }

    if (autoUpdateJob) {
      autoUpdateJob.stop();
      autoUpdateJob = null;
    }
    
    if (dailyCheckJob) {
      dailyCheckJob.stop();
      dailyCheckJob = null;
    }
    
    res.json({ message: '자동 업데이트가 중지되었습니다.' });
  } catch (error) {
    console.error('자동 업데이트 중지 실패:', error);
    res.status(500).json({ error: '자동 업데이트 중지 중 오류가 발생했습니다.' });
  }
});

module.exports = router;