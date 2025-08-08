const { google } = require('googleapis');
const moment = require('moment-timezone');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    this.dataset2SpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID2;
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

  // 일별 데이터를 Google Sheets에 업데이트
  async updateDailyData(date, data) {
    try {
      if (!this.sheets || !this.spreadsheetId) {
        throw new Error('Google Sheets API가 초기화되지 않았습니다.');
      }

      // dataset 시트 업데이트
      await this.updateDatasetSheet(date, data);
      
      // 25.08 시트 업데이트
      await this.updateMonthlySheet(date, data);
      
      // dataset2 시트 업데이트 (마일리지 통계)
      await this.updateDataset2Sheet(date);

      console.log(`${date} 데이터 업데이트 완료`);
    } catch (error) {
      console.error('Google Sheets 업데이트 실패:', error);
      throw error;
    }
  }

  // dataset 시트 업데이트
  async updateDatasetSheet(date, data) {
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
    } else {
      // 새 데이터 추가
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'dataset!A:G',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });
    }
  }

  // 25.08 시트 업데이트 (업데이트 시간 제외)
  async updateMonthlySheet(date, data) {
    try {
      // 날짜에서 일자만 추출
      const day = parseInt(date.split('-')[2]);
      const rowIndex = day + 4; // B4부터 시작하므로 +4 (1일 = B5, 2일 = B6, ...)

      // 오늘 날짜 확인
      const today = new Date().toISOString().split('T')[0];
      const isToday = date === today;

      // 오늘이 아닌 경우에만 기존 데이터 확인
      if (!isToday) {
        const existingData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `25.08!C${rowIndex}:F${rowIndex}`,
        });

        // 데이터가 있으면 건너뛰기
        if (existingData.data.values && existingData.data.values.length > 0) {
          const row = existingData.data.values[0];
          const hasData = row.some(cell => cell && cell.toString().trim() !== '');
          
          if (hasData) {
            console.log(`25.08 시트 ${day}일 데이터가 이미 존재함 - 건너뛰기`);
            return;
          }
        }
      }

      // 숫자로 변환하여 수식 적용이 가능하도록 함
      const values = [
        [
          parseInt(data.new_integrated_users) || 0,     // 신규가입
          parseInt(data.converted_integrated_users) || 0, // 통합전환
          parseInt(data.physical_card_requests) || 0,   // 실물카드신청
          parseInt(data.online_auto_issued_cards) || 0  // 온라인카드 자동발급
        ]
      ];

      // 25.08 시트의 해당 일자 행에 데이터 업데이트 (일자 제외, C열부터 F열까지)
      // USER_ENTERED를 사용하여 숫자로 인식되도록 함
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `25.08!C${rowIndex}:F${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      
      if (isToday) {
        console.log(`25.08 시트 ${day}일 데이터 업데이트 완료 (오늘 날짜 - 재업데이트 허용)`);
      } else {
        console.log(`25.08 시트 ${day}일 데이터 업데이트 완료`);
      }
    } catch (error) {
      console.error('월별 시트 업데이트 실패:', error);
      throw error;
    }
  }

  // dataset2 시트 업데이트 (마일리지 통계)
  async updateDataset2Sheet(date) {
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
            valueInputOption: 'USER_ENTERED',
            resource: { values }
          });
        } else {
          await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.dataset2SpreadsheetId,
            range: 'dataset2!A:P',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
          });
        }
        console.log(`dataset2 시트 ${date} 마일리지 통계 업데이트 완료`);
      }

      // 2) 회원등급별 통계 -> dataset3 시트
      if (gradeResult.rows.length > 0) {
        await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset3');

        const gradeValues = gradeResult.rows.map(row => [
          date,
          row.grade_nm,
          row.charging_count || 0,
          row.avg_pc || 0,
          row.avg_paid_price || 0,
          row.avg_mileage || 0
        ]);

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: 'dataset3!A:F',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: gradeValues }
        });
        console.log(`dataset3 시트 ${date} 회원등급별 통계 업데이트 완료`);
      }

      // 3) 회원 등록 카운트 -> dataset4 시트
      if (registrationResult.rows.length > 0) {
        await this.ensureSheetExists(this.dataset2SpreadsheetId, 'dataset4');

        const registrationData = registrationResult.rows[0];
        const registrationValues = [
          [
            date,
            registrationData.registration_count || 0,
            moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
          ]
        ];

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.dataset2SpreadsheetId,
          range: 'dataset4!A:C',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: registrationValues }
        });
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