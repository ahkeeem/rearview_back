// Uses Termii (common in Nigeria) for SMS delivery
// Configure in backend/.env

const smsService = {
    sendOTP: async (phoneNumber, otpCode) => {
        const fetch = (await import('node-fetch')).default;
        
        const termiiApiKey = process.env.TERMII_API_KEY;
        const termiiSenderId = process.env.TERMII_SENDER_ID || 'N-Alert';

        if (!termiiApiKey) {
            console.warn('⚠️  TERMII_API_KEY not found in .env. Skipping real SMS delivery.');
            return false;
        }

        try {
            const payload = {
                to: phoneNumber,
                from: termiiSenderId,
                sms: `Your RearView verification code is: ${otpCode}. It expires shortly.`,
                type: "plain",
                channel: "dnd", // 'dnd', 'generic', or 'whatsapp'
                api_key: termiiApiKey
            };

            const response = await fetch('https://api.ng.termii.com/api/sms/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (response.ok && data.message === 'Successfully Sent') {
                console.log('✅ SMS sent successfully to:', phoneNumber);
                return true;
            } else {
                console.error('❌ Termii SMS rejected:', data);
                return false;
            }

        } catch (error) {
            console.error('❌ Failed to send SMS:', error);
            return false;
        }
    }
};

module.exports = smsService;
