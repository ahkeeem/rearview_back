const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 465, // Default to 465 for cloud SSL compatibility
    secure: process.env.SMTP_PORT == '465' || !process.env.SMTP_PORT, // True if 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // Fixes silent SMTP failures in cloud environments
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
            // Throw so the calling controller knows delivery failed
            throw error;
        }
    },

    // ── Escrow Transaction Notifications ──────────────────────────────────────
    sendEscrowNotification: async (toEmail, toName, context, data = {}) => {
        const templates = {
            order_funded: {
                subject: `✅ Escrow Funded — ${data.title || 'Your Order'} is Ready`,
                heading: 'Payment is Secured',
                body: `
                    <p>Good news! <strong>${data.buyer_name || 'Your buyer'}</strong> has funded your escrow order.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <tr><td style="padding:8px 0;color:#666;">Order</td><td style="padding:8px 0;font-weight:bold;">${data.title}</td></tr>
                        <tr><td style="padding:8px 0;color:#666;">Reference</td><td style="padding:8px 0;font-family:monospace;">${data.order_ref}</td></tr>
                        <tr><td style="padding:8px 0;color:#666;">You will receive</td><td style="padding:8px 0;font-weight:bold;color:#2e7d32;">₦${Number(data.vendor_amount || 0).toLocaleString()}</td></tr>
                    </table>
                    <p style="background:#e8f5e9;padding:12px;border-radius:8px;color:#2e7d32;">
                        <strong>Action required:</strong> Please deliver the agreed service. Your buyer will release payment when satisfied.
                    </p>
                `
            },
            item_delivered_prompt: {
                subject: `📦 Item Delivered — Please release funds for ${data.title || 'Your Order'}`,
                heading: 'Your Vendor Marked this Order as Delivered',
                body: `
                    <p>The vendor has marked your escrow order <strong>${data.title}</strong> as delivered or completed.</p>
                    <p style="background:#fff3e0;padding:12px;border-radius:8px;color:#e65100;">
                        <strong>Action required:</strong> Please inspect your product/service. If everything is in order, log into your RearView dashboard and click "Release Funds" to pay the vendor. 
                        If there is an issue, you may open a dispute.
                    </p>
                `
            },
            delivery_confirmed: {
                subject: `💰 Payment Released — ₦${Number(data.vendor_amount || 0).toLocaleString()} is in your wallet`,
                heading: 'Funds Released to You',
                body: `
                    <p>Your buyer has confirmed delivery. Your payment has been released.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <tr><td style="padding:8px 0;color:#666;">Order</td><td style="padding:8px 0;font-weight:bold;">${data.title}</td></tr>
                        <tr><td style="padding:8px 0;color:#666;">Amount received</td><td style="padding:8px 0;font-weight:bold;color:#2e7d32;">₦${Number(data.vendor_amount || 0).toLocaleString()}</td></tr>
                    </table>
                    <p>Log in to RearView to withdraw your earnings to your bank account.</p>
                `
            },
            dispute_opened: {
                subject: `⚠️ Dispute Opened — ${data.order_ref}`,
                heading: 'A Dispute Has Been Raised',
                body: `
                    <p>A dispute has been opened on your escrow order. <strong>Funds remain safely locked</strong> until this is resolved.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <tr><td style="padding:8px 0;color:#666;">Order</td><td style="padding:8px 0;font-weight:bold;">${data.title}</td></tr>
                        <tr><td style="padding:8px 0;color:#666;">Reference</td><td style="padding:8px 0;font-family:monospace;">${data.order_ref}</td></tr>
                        <tr><td style="padding:8px 0;color:#666;">Reason</td><td style="padding:8px 0;color:#c62828;">${data.dispute_reason || 'Not specified'}</td></tr>
                    </table>
                    <p style="background:#fff3e0;padding:12px;border-radius:8px;color:#e65100;">
                        Our team will review this dispute and contact both parties. Do not attempt to transfer funds outside the platform.
                    </p>
                `
            },
            dispute_resolved: {
                subject: `✅ Dispute Resolved — ${data.order_ref}`,
                heading: 'Your Dispute Has Been Resolved',
                body: `
                    <p>Our team has reviewed and resolved the dispute on order <strong>${data.order_ref}</strong>.</p>
                    <p style="background:${data.resolution === 'release' ? '#e8f5e9' : '#e3f2fd'};padding:12px;border-radius:8px;color:${data.resolution === 'release' ? '#2e7d32' : '#1565c0'};">
                        <strong>Outcome:</strong> ${data.resolution === 'release' ? 'Funds were released to the vendor.' : 'Funds were refunded to the buyer.'}
                    </p>
                `
            }
        };

        const tmpl = templates[context];
        if (!tmpl) return false;

        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:12px;">
                <div style="background:linear-gradient(135deg,#1e3c72,#2a5298);padding:24px;border-radius:8px 8px 0 0;margin-bottom:0;">
                    <h1 style="color:white;margin:0;font-size:22px;">🛡️ RearView Escrow</h1>
                </div>
                <div style="background:white;padding:28px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;border-top:none;">
                    <h2 style="color:#1e3c72;margin-top:0;">${tmpl.heading}</h2>
                    <p>Hi ${toName || 'there'},</p>
                    ${tmpl.body}
                    <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
                        This is an automated notification from RearView. Your funds are always protected by our escrow system.
                    </p>
                </div>
            </div>
        `;

        try {
            await transporter.verify();
            await transporter.sendMail({
                from: process.env.FROM_EMAIL || '"RearView Escrow" <noreply@rearview.app>',
                to: toEmail,
                subject: tmpl.subject,
                html
            });
            return true;
        } catch (err) {
            console.error(`❌ Escrow email (${context}) failed:`, err.message);
            throw err;
        }
    }
};

module.exports = emailService;
