const fs = require('fs');
const path = require('path');

function normalizeServiceAccount(serviceAccount) {
  if (!serviceAccount) return null;
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  return serviceAccount;
}

function loadGoogleServiceAccount() {
  const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      return normalizeServiceAccount(JSON.parse(jsonEnv));
    } catch (error) {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패:', error.message);
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const projectId = process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID;
  if (clientEmail && privateKey) {
    return normalizeServiceAccount({
      client_email: clientEmail,
      private_key: privateKey,
      project_id: projectId,
    });
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    try {
      const resolvedPath = path.isAbsolute(keyFile)
        ? keyFile
        : path.join(process.cwd(), keyFile);
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      return normalizeServiceAccount(JSON.parse(raw));
    } catch (error) {
      console.error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE 로드 실패:', error.message);
    }
  }

  return null;
}

module.exports = {
  loadGoogleServiceAccount,
};
