// Require the Client constructor from the pg package
const { Client } = require('pg');
// Create a constant, CONNECTION_STRING, from either process.env.DATABASE_URL or postgres://localhost:5432/phenomena-dev
const CONNECTION_STRING = "postgres://localhost:5432/phenomena-dev";
// Create the client using new Client(CONNECTION_STRING)
// Do not connect to the client in this file!
const client = new Client(CONNECTION_STRING);
/**
 * Report Related Methods
 */

async function getOpenReports() {
  try {
    // first load all of the reports which are open
    const { rows: reports } = await client.query(`
      SELECT *
      FROM reports
      WHERE isOpen = true
    `);

    // then load the comments only for those reports, using a
    // WHERE "reportId" IN () clause
    const reportIds = reports.map(report => report.id);
    const { rows: comments } = await client.query(`
      SELECT *
      FROM comments
      WHERE "reportId" IN (${reportIds})
    `);

    // then, build two new properties on each report:
    // .comments for the comments which go with it
    //    it should be an array, even if there are none
    // .isExpired if the expiration date is before now
    //    you can use Date.parse(report.expirationDate) < new Date()
    // also, remove the password from all reports
    const modifiedReports = reports.map(report => {
      const reportComments = comments.filter(comment => comment.reportId === report.id);
      const isExpired = Date.parse(report.expirationDate) < new Date();
      delete report.password;
      return {
        ...report,
        comments: reportComments,
        isExpired
      };
    });

    // finally, return the reports
    return modifiedReports;
  } catch (error) {
    throw error;
  }
}


/**
 * You should use the reportFields parameter (which is
 * an object with properties: title, location, description, password)
 * to insert a new row into the reports table.
 * 
 * On success, you should return the new report object,
 * and on failure you should throw the error up the stack.
 * 
 * Make sure to remove the password from the report object
 * before returning it.
 */
async function createReport({
  title, 
  location, 
  description, 
  password 
}) {
  // Get all of the fields from the passed in object
  try {
    // insert the correct fields into the reports table
    // remember to return the new row from the query
    const {rows:[report]} = await client.query(`
 INSERT INTO reports (title, location, description, password)
 VALUES ($1, $2, $3, $4)
 RETURNING *;
 `, [ title, location, description, password])

    // remove the password from the returned row
    delete report.password;

    // return the new report
    
  return report;

 
  } catch (error) {
    throw error;
  }
  
}

/**
 * NOTE: This function is not for use in other files, so we use an _ to
 * remind us that it is only to be used internally.
 * (for our testing purposes, though, we WILL export it)
 * 
 * It is used in both closeReport and createReportComment, below.
 * 
 * This function should take a reportId, select the report whose 
 * id matches that report id, and return it. 
 * 
 * This should return the password since it will not eventually
 * be returned by the API, but instead used to make choices in other
 * functions.
 */
async function _getReport(reportId) {
  try {
    const { rows: [report] } = await client.query(`
      SELECT *
      FROM reports
      WHERE id = $1
    `, [reportId]);

    return report;
  } catch (error) {
    throw error;
  }
}


/**
 * You should update the report where the reportId 
 * and password match, setting isOpen to false.
 * 
 * If the report is updated this way, return an object
 * with a message of "Success".
 * 
 * If nothing is updated this way, throw an error
 */
async function closeReport(reportId, password) {
  try {
    // First, actually grab the report with that id
    const report = await _getReport(reportId);

    // If it doesn't exist, throw an error with a useful message
    if (!report) {
      throw new Error(`Report with id ${reportId} does not exist.`);
    }

    // If the passwords don't match, throw an error
    if (report.password !== password) {
      throw new Error(`Invalid password for report with id ${reportId}.`);
    }

    // If it has already been closed, throw an error with a useful message
    if (!report.isOpen) {
      throw new Error(`Report with id ${reportId} is already closed.`);
    }

    // Finally, update the report if there are no failures, as above
    await client.query(`
      UPDATE reports
      SET isOpen = false
      WHERE id = $1
    `, [reportId]);

    // Return a message stating that the report has been closed
    return { message: 'Success' };
  } catch (error) {
    throw error;
  }
}


/**
 * Comment Related Methods
 */

/**
 * If the report is not found, or is closed or expired, throw an error
 * 
 * Otherwise, create a new comment with the correct
 * reportId, and update the expirationDate of the original
 * report to CURRENT_TIMESTAMP + interval '1 day' 
 */
async function createReportComment(reportId, { content }) {
  try {
    // grab the report we are going to be commenting on
    const report = await _getReport(reportId);

    // if it wasn't found, throw an error saying so
    if (!report) {
      throw new Error(`Report with id ${reportId} does not exist.`);
    }

    // if it is not open, throw an error saying so
    if (!report.isOpen) {
      throw new Error(`Report with id ${reportId} is closed.`);
    }

    // if the current date is past the expiration, throw an error saying so
    // you can use Date.parse(report.expirationDate) < new Date() to check
    if (Date.parse(report.expirationDate) < new Date()) {
      throw new Error(`Report with id ${reportId} has expired.`);
    }

    // all go: insert a comment
    const { rows: [comment] } = await client.query(`
      INSERT INTO comments (reportId, content)
      VALUES ($1, $2)
      RETURNING *;
    `, [reportId, content]);

    // then update the expiration date to a day from now
    await client.query(`
      UPDATE reports
      SET expirationDate = CURRENT_TIMESTAMP + interval '1 day'
      WHERE id = $1
    `, [reportId]);

    // finally, return the comment
    return comment;
  } catch (error) {
    throw error;
  }
}


// export the client and all database functions below

module.exports = {
  client,
 getOpenReports,
  createReport,
  createReportComment,
  closeReport
}