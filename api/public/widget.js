(function() {
  const API = 'https://guider-app.vercel.app';
  let messages = [];

  const style = document.createElement('style');
  style.textContent = `
    #guider-fab {
      position: fixed; bottom: 24px; left: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
    }
    #guider-bubble {
      background: #fff; border-radius: 12px 12px 12px 4px;
      padding: 10px 14px; font-size: 13px; color: #1a1a1a;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      font-family: Cairo, sans-serif; font-weight: 600;
      animation: guiderFloat 3s ease-in-out infinite;
    }
    #guider-btn {
      width: 56px; height: 56px; border-radius: 18px;
      background: linear-gradient(135deg, #2c1a0e, #5c3317);
      border: none; font-size: 26px; cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    }
    #guider-btn:hover { transform: scale(1.08); }
    #guider-widget {
      position: fixed; bottom: 100px; left: 24px;
      width: 360px; max-height: 540px;
      background: #fff; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      z-index: 9998; display: none; flex-direction: column;
      font-family: Cairo, sans-serif; overflow: hidden;
    }
