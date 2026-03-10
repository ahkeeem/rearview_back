# Railway Deployment Context

## Database Configuration
Current database.js setup handles both local and Railway environments:
```javascript
if (isRailway) {
    pool = mysql.createPool(process.env.MYSQL_URL);
} else {
    const dbConfig = {
        host: process.env.LOCAL_DB_HOST,
        user: process.env.LOCAL_DB_USER,
        password: process.env.LOCAL_DB_PASSWORD,
        database: process.env.LOCAL_DB_NAME,
        port: process.env.LOCAL_DB_PORT
    };
    pool = mysql.createPool(dbConfig);
}
```

## Environment Variables
```bash
# Local Database
LOCAL_DB_HOST=localhost
LOCAL_DB_USER=root
LOCAL_DB_PASSWORD=
LOCAL_DB_NAME=rearview
LOCAL_DB_PORT=3306

# Railway Database
MYSQL_URL=your-railway-mysql-url
USE_RAILWAY=true
```

## Railway Setup Steps
1. Install Railway CLI:
```bash
sudo npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Initialize Project:
```bash
railway init
```

4. Add MySQL Database:
```bash
railway add --database mysql
```

## Database Migration Steps
1. Connect to Railway MySQL:
```bash
railway connect mysql
```

2. Import Schema:
```bash
mysql -h your-railway-host -u root -p -P your-port
source database/Rearview.sql
source database/schema_updates.sql
```

## Testing Commands
Test local connection:
```bash
USE_RAILWAY=false npm start
```

Test Railway connection:
```bash
USE_RAILWAY=true npm start
```

## Next Steps
1. Complete database migration to Railway
2. Set up environment variables in Railway dashboard
3. Deploy backend application
4. Configure domain and SSL

## Notes
- Free tier includes $5 credit monthly
- Resources go idle when not in use
- Connection tested successfully for local environment
- Railway database setup pending completion
