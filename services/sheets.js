const { google } = require('googleapis');
const moment = require('moment-timezone');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    this.initializeAuth();
  }

  // Ensure a given sheet(tab) exists inside a spreadsheet; create it if missing
  async ensureSheetExists(spreadsheetId, sheetTitle) {
    const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
    const exists = (spreadsheet.data.sheets || []).some(
      s => s.properties && s.properties.title === sheetTitle
    );
    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetTitle }
              }
            }
          ]
        }
      });
    }
  }

  // Google Sheets 인증 초기화
  async initializeAuth() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.auth = auth;
      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets API 인증 성공');
    } catch (error) {
      console.error('Google Sheets API 인증 실패:', error);
    }
  }

  // 일별 데이터를 Google Sheets에 업데이트 - 재시도 정책 포함
  async updateDailyData(date, data) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        if (!this.sheets || !this.spreadsheetId) {
          throw new Error('Google Sheets API가 초기화되지 않았습니다.');
        }

        // 오늘 날짜 확인
        const today = new Date().toISOString().split('T')[0];
        const isToday = date === today;

        // 기존 데이터가 있어도 항상 업데이트 진행
        console.log(`${date} 데이터 업데이트 진행`);

        // dataset 시트 업데이트
        await this.updateDatasetSheet(date, data);
        
        // 월별 시트 업데이트 (25.08, 25.09 등)
        await this.updateMonthlySheet(date, data);

        console.log(`${date} 데이터 업데이트 완료`);
        
        // 성공하면 루프 종료
        break;
        
      } catch (error) {
        retryCount++;
        console.error(`Google Sheets 업데이트 실패 (시도 ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount >= maxRetries) {
          console.error('최대 재시도 횟수 초과. Google Sheets 업데이트를 포기합니다.');
          throw error;
        }
        
        // 5초 대기 후 재시도
        console.log(`5초 후 재시도합니다...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  // 이미 업데이트된 날짜인지 확인
  async checkIfAlreadyUpdated(date) {
    try {
      // dataset 시트에서 해당 날짜 데이터 확인
      const existingData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'dataset!A:A',
      });

      const rows = existingData.data.values || [];
      
      // 해당 날짜의 데이터가 있는지 확인
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === date) {
          return true; // 이미 업데이트됨
        }
      }

      return false; // 업데이트되지 않음
    } catch (error) {
      console.error(`업데이트 상태 확인 실패 (${date}):`, error);
      return false; // 에러 시 업데이트 진행
    }
  }

  // dataset 시트 업데이트 - 재시도 정책 포함
  async updateDatasetSheet(date, data) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const values = [
          [
            date,
            data.new_integrated_users,
            data.converted_integrated_users,
            data.physical_card_requests,
            data.online_auto_issued_cards,
            moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
          ]
        ];

        // 오늘 날짜 확인
        const today = new Date().toISOString().split('T')[0];
        const isToday = date === today;

        // 기존 데이터 확인
        const existingData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'dataset!A:A',
        });

        const rows = existingData.data.values || [];
        let rowIndex = -1;

        // 해당 날짜의 데이터가 있는지 확인
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === date) {
            rowIndex = i + 1; // 1-based index
            break;
          }
        }

        if (rowIndex > 0) {
          // 기존 데이터 업데이트
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `dataset!A${rowIndex}:G${rowIndex}`,
            valueInputOption: 'RAW',
            resource: { values }
          });
          
          if (isToday) {
            console.log(`dataset 시트 ${date} 기존 데이터 갱신 완료`);
          } else {
            console.log(`dataset 시트 ${date} 기존 데이터 업데이트 완료`);
          }
        } else {
          // 새 데이터 추가
          await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: 'dataset!A:G',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
          });
          
          console.log(`dataset 시트 ${date} 새 데이터 추가 완료`);
        }
        
        // 성공하면 루프 종료
        break;
        
      } catch (error) {
        retryCount++;
        console.error(`dataset 시트 업데이트 실패 (시도 ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount >= maxRetries) {
          console.error('최대 재시도 횟수 초과. dataset 시트 업데이트를 포기합니다.');
          throw error;
        }
        
        // 3초 대기 후 재시도
        console.log(`3초 후 재시도합니다...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  // 월별 시트 업데이트 (업데이트 시간 제외) - 재시도 정책 포함
  async updateMonthlySheet(date, data) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // 날짜에서 월과 일자 추출
        const [year, month, day] = date.split('-');
        const dayNum = parseInt(day);
        const rowIndex = dayNum + 4; // B4부터 시작하므로 +4 (1일 = B5, 2일 = B6, ...)
        
        // 시트 이름 결정 (25.08, 25.09, 25.10 등)
        const sheetName = `26.${month.padStart(2, '0')}`;
        
        // 시트가 존재하는지 확인하고 없으면 생성
        await this.ensureSheetExists(this.spreadsheetId, sheetName);

        // 오늘 날짜 확인
        const today = new Date().toISOString().split('T')[0];
        const isToday = date === today;

        // 기존 데이터가 있어도 항상 업데이트 진행
        console.log(`${sheetName} 시트 ${dayNum}일 데이터 업데이트 진행`);

        // 숫자로 변환하여 수식 적용이 가능하도록 함
        const values = [
          [
            parseInt(data.new_integrated_users) || 0,     // 신규가입
            parseInt(data.converted_integrated_users) || 0, // 통합전환
            parseInt(data.physical_card_requests) || 0,   // 실물카드신청
            parseInt(data.online_auto_issued_cards) || 0  // 온라인카드 자동발급
          ]
        ];

        // 해당 월 시트의 일자 행에 데이터 업데이트 (일자 제외, C열부터 F열까지)
        // USER_ENTERED를 사용하여 숫자로 인식되도록 함
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!C${rowIndex}:F${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values }
        });
        
        if (isToday) {
          console.log(`${sheetName} 시트 ${dayNum}일 데이터 갱신 완료 (오늘 날짜)`);
        } else {
          console.log(`${sheetName} 시트 ${dayNum}일 데이터 업데이트 완료`);
        }
        
        // 성공하면 루프 종료
        break;
        
      } catch (error) {
        retryCount++;
        console.error(`월별 시트 업데이트 실패 (시도 ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount >= maxRetries) {
          console.error('최대 재시도 횟수 초과. 월별 시트 업데이트를 포기합니다.');
          throw error;
        }
        
        // 3초 대기 후 재시도
        console.log(`3초 후 재시도합니다...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  // dataset2 시트 업데이트 (마일리지 통계) - 비활성화됨
  async updateDataset2Sheet(date) {
    // Dataset2 시트 업데이트가 비활성화되었습니다.
    console.log(`Dataset2 시트 업데이트가 비활성화되었습니다. (${date})`);
    return;
    try {
      if (!this.sheets || !this.dataset2SpreadsheetId) {
        console.log('dataset2 스프레드시트 ID가 설정되지 않았습니다.');
        return;
      }

      const pool = require('../config/database');
      const { queries } = require('../models/queries');

      // 마일리지 통계 데이터 조회
      const mileageQuery = queries.getMileageStats(date);
      const mileageResult = await pool.query(mileageQuery.text, mileageQuery.values);
      
      // 회원등급별 통계 데이터 조회
      const gradeQuery = queries.getMileageGradeStats(date);
      const gradeResult = await pool.query(gradeQuery.text, gradeQuery.values);
      
      // 회원 등록 카운트 조회
      const registrationQuery = queries.getDailyUserRegistration(date);
      const registrationResult = await pool.query(registrationQuery.text, registrationQuery.values);

      // 1) 마일리지 통계 -> dataset2 시트
      if (mileageResult.rows.length > 0) {
        const mileageData = mileageResult.rows[0];

        await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset2');

        const values = [
          [
            date,
            mileageData.total_pc || 0,
            mileageData.used_point || 0,
            mileageData.use_card_price || 0,
            mileageData.paid_price || 0,
            mileageData.served_mileage || 0,
            mileageData.charging_count || 0,
            mileageData.elctc_pc_ratio || 0,
            mileageData.paid_price_ratio || 0,
            mileageData.point_success_count || 0,
            mileageData.point_other_status_count || 0,
            mileageData.avg_price || 0,
            mileageData.avg_paid_price || 0,
            mileageData.avg_mileage || 0,
            mileageData.charging_qy || 0,
            moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
          ]
        ];

        const existingData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: 'dataset2!A:A',
        });

        const rows = existingData.data.values || [];
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === date) {
            rowIndex = i + 1;
            break;
          }
        }

        if (rowIndex > 0) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: `dataset2!A${rowIndex}:P${rowIndex}`,
            valueInputOption: 'RAW',
            resource: { values }
          });
        } else {
          await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: 'dataset2!A:P',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
          });
        }
        console.log(`dataset2 시트 ${date} 마일리지 통계 업데이트 완료`);
      }

      // 2) 회원등급별 통계 -> dataset3 시트
      if (gradeResult.rows.length > 0) {
        await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset3');

        // 기존 데이터 확인 (해당 날짜의 등급별 데이터)
        const existingGradeData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: 'dataset3!A:A',
        });

        const gradeRows = existingGradeData.data.values || [];
        let gradeRowIndex = -1;

        // 해당 날짜의 데이터가 있는지 확인
        for (let i = 1; i < gradeRows.length; i++) {
          if (gradeRows[i][0] === date) {
            gradeRowIndex = i + 1;
            break;
          }
        }

        const gradeValues = gradeResult.rows.map(row => [
          date,
          row.grade_nm,
          row.charging_count || 0,
          row.avg_pc || 0,
          row.avg_paid_price || 0,
          row.avg_mileage || 0
        ]);

        if (gradeRowIndex > 0) {
          // 기존 데이터가 있으면 해당 행부터 삭제 후 새 데이터 추가
          const deleteRange = `dataset3!A${gradeRowIndex}:F${gradeRowIndex + gradeValues.length - 1}`;
          await this.sheets.spreadsheets.values.clear({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: deleteRange,
          });
          
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: `dataset3!A${gradeRowIndex}:F${gradeRowIndex + gradeValues.length - 1}`,
            valueInputOption: 'RAW',
            resource: { values: gradeValues }
          });
        } else {
          // 새 데이터 추가
          await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: 'dataset3!A:F',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: gradeValues }
          });
        }
        console.log(`dataset3 시트 ${date} 회원등급별 통계 업데이트 완료`);
      }

      // 3) 회원 등록 카운트 -> dataset4 시트
      if (registrationResult.rows.length > 0) {
        await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset4');

        // 기존 데이터 확인
        const existingRegistrationData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: 'dataset4!A:A',
        });

        const registrationRows = existingRegistrationData.data.values || [];
        let registrationRowIndex = -1;

        // 해당 날짜의 데이터가 있는지 확인
        for (let i = 1; i < registrationRows.length; i++) {
          if (registrationRows[i][0] === date) {
            registrationRowIndex = i + 1;
            break;
          }
        }

        const registrationData = registrationResult.rows[0];
        const registrationValues = [
          [
            date,
            registrationData.registration_count || 0,
            moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
          ]
        ];

        if (registrationRowIndex > 0) {
          // 기존 데이터 업데이트
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: `dataset4!A${registrationRowIndex}:C${registrationRowIndex}`,
            valueInputOption: 'RAW',
            resource: { values: registrationValues }
          });
        } else {
          // 새 데이터 추가
          await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: 'dataset4!A:C',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: registrationValues }
          });
        }
        console.log(`dataset4 시트 ${date} 회원 등록 카운트 업데이트 완료`);
      }

    } catch (error) {
      console.error('dataset2 시트 업데이트 실패:', error);
      throw error;
    }
  }

  // dataset2 시트 헤더 설정
  async setupDataset2Headers() {
    try {
      if (!this.sheets || !this.dataset2SpreadsheetId) {
        throw new Error('dataset2 스프레드시트 ID가 설정되지 않았습니다.');
      }

      // Ensure target sheets exist
      await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset2');
      await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset3');
      await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset4');

      // dataset2: 마일리지 통계 헤더
      const mileageHeaders = [
        ['날짜', '총 충전금액', '포인트 사용금액', '카드 사용금액', '실제 결제금액', '서비스 마일리지', 
         '충전 건수', '충전금 대비 마일리지 비율(%)', '결제금 대비 마일리지 비율(%)', 
         '포인트 성공 건수', '포인트 기타 상태 건수', '평균 충전금액', '평균 결제금액', 
         '평균 마일리지', '충전량', '업데이트 시간']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.dataset2SpreadsheetId,
        range: 'dataset2!A1:P1',
        valueInputOption: 'RAW',
        resource: { values: mileageHeaders }
      });

      // dataset3: 회원등급별 통계 헤더
      const gradeHeaders = [
        ['날짜', '등급명', '충전 건수', '평균 충전금액', '평균 결제금액', '평균 마일리지']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.dataset2SpreadsheetId,
        range: 'dataset3!A1:F1',
        valueInputOption: 'RAW',
        resource: { values: gradeHeaders }
      });

      // dataset4: 회원 등록 카운트 헤더
      const registrationHeaders = [
        ['날짜', '회원 등록 수', '업데이트 시간']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.dataset2SpreadsheetId,
        range: 'dataset4!A1:C1',
        valueInputOption: 'RAW',
        resource: { values: registrationHeaders }
      });

      console.log('dataset2, dataset3, dataset4 시트 헤더 설정 완료');
      return true;
    } catch (error) {
      console.error('dataset2 헤더 설정 실패:', error);
      throw error;
    }
  }

  // 중복 데이터 정리
  async cleanDuplicateData(date) {
    try {
      if (!this.sheets || !this.dataset2SpreadsheetId) {
        throw new Error('dataset2 스프레드시트 ID가 설정되지 않았습니다.');
      }

      // 1. Dataset2 (마일리지 통계) 중복 정리
      await this.cleanDataset2Duplicates(date);
      
      // 2. Dataset3 (등급별 통계) 중복 정리
      await this.cleanDataset3Duplicates(date);
      
      // 3. Dataset4 (회원 등록) 중복 정리
      await this.cleanDataset4Duplicates(date);

      console.log(`${date} 중복 데이터 정리 완료`);
    } catch (error) {
      console.error(`${date} 중복 데이터 정리 실패:`, error);
      throw error;
    }
  }

  // Dataset2 중복 정리
  async cleanDataset2Duplicates(date) {
    const existingData = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.dataset2SpreadsheetId,
      range: 'dataset2!A:A',
    });

    const rows = existingData.data.values || [];
    const duplicateRows = [];

    // 해당 날짜의 모든 행 찾기
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === date) {
        duplicateRows.push(i + 1);
      }
    }

    // 중복이 있으면 첫 번째만 남기고 나머지 삭제
    if (duplicateRows.length > 1) {
      const rowsToDelete = duplicateRows.slice(1); // 첫 번째 제외하고 삭제할 행들
      
      // 뒤에서부터 삭제 (인덱스 변경 방지)
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: `dataset2!A${rowsToDelete[i]}:P${rowsToDelete[i]}`,
        });
      }
      
      console.log(`Dataset2 ${date}: ${duplicateRows.length - 1}개 중복 행 삭제`);
    }
  }

  // Dataset3 중복 정리
  async cleanDataset3Duplicates(date) {
    const existingData = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.dataset2SpreadsheetId,
      range: 'dataset3!A:A',
    });

    const rows = existingData.data.values || [];
    const duplicateRows = [];

    // 해당 날짜의 모든 행 찾기
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === date) {
        duplicateRows.push(i + 1);
      }
    }

    // 중복이 있으면 첫 번째만 남기고 나머지 삭제
    if (duplicateRows.length > 1) {
      const rowsToDelete = duplicateRows.slice(1);
      
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: `dataset3!A${rowsToDelete[i]}:F${rowsToDelete[i]}`,
        });
      }
      
      console.log(`Dataset3 ${date}: ${duplicateRows.length - 1}개 중복 행 삭제`);
    }
  }

  // Dataset4 중복 정리
  async cleanDataset4Duplicates(date) {
    const existingData = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.dataset2SpreadsheetId,
      range: 'dataset4!A:A',
    });

    const rows = existingData.data.values || [];
    const duplicateRows = [];

    // 해당 날짜의 모든 행 찾기
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === date) {
        duplicateRows.push(i + 1);
      }
    }

    // 중복이 있으면 첫 번째만 남기고 나머지 삭제
    if (duplicateRows.length > 1) {
      const rowsToDelete = duplicateRows.slice(1);
      
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: `dataset4!A${rowsToDelete[i]}:C${rowsToDelete[i]}`,
        });
      }
      
      console.log(`Dataset4 ${date}: ${duplicateRows.length - 1}개 중복 행 삭제`);
    }
  }

  // 헤더 설정
  async setupHeaders() {
    try {
      const headers = [
        ['날짜', '통합 신규', '통합 전환', '실물 카드 신청', '온라인 카드 자동발급', '업데이트 시간']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'dataset!A1:G1',
        valueInputOption: 'RAW',
        resource: { values: headers }
      });

      // 헤더 스타일 설정
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 7
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.2,
                      blue: 0.2
                    },
                    textFormat: {
                      foregroundColor: {
                        red: 1,
                        green: 1,
                        blue: 1
                      },
                      bold: true
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId: 0,
                  gridProperties: {
                    frozenRowCount: 1
                  }
                },
                fields: 'gridProperties.frozenRowCount'
              }
            }
          ]
        }
      });

      console.log('Google Sheets 헤더 설정 완료');
      return true;
    } catch (error) {
      console.error('헤더 설정 실패:', error);
      throw error;
    }
  }
}

module.exports = GoogleSheetsService;