const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT, // usually 587 or 465
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const emailService = {
    sendOTP: async (toEmail, toName, otpCode, context = 'login') => {
        let subject = '';
        let message = '';

        if (context === 'login') {
            subject = 'Your RearView Login Verification Code';
            message = `Your verification code is: <b>${otpCode}</b><br>This code expires in 5 minutes.`;
        } else if (context === 'verify') {
            subject = 'Verify Your Email for RearView';
            message = `Your email verification code is: <b>${otpCode}</b><br>This code expires in 10 minutes.`;
        } else if (context === 'password_reset') {
            subject = 'RearView Password Reset';
            message = `Your password reset code is: <b>${otpCode}</b><br>This code expires in 15 minutes.`;
        }

        const mailOptions = {
            from: process.env.FROM_EMAIL || '"RearView Support" <noreply@rearview.local>',
            to: toEmail,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Hello ${toName || 'User'},</h2>
                    <p>${message}</p>
                    <p style="color: #888; font-size: 12px; margin-top: 20px;">If you didn't request this code, please ignore this email or contact support.</p>
                </div>
            `
        };

        try {
            // Verify transporter before sending to avoid silent failures
            await transporter.verify();
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully:', info.messageId);
            return true;
        } catch (error) {
            console.error('❌ Failed to send email:', error);
            // Don't throw for now to avoid crashing the flow if SMTP isn't set up yet
            return false;
        }
    }
};

module.exports = emailService;
