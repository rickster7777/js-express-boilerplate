const { App } = require("@slack/bolt");
const { BigQuery } = require("@google-cloud/bigquery");
const { PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY } = require("./constants");
const cron = require("node-cron");

require("dotenv").config();
const fetchDocuments = require('./fetchDocuments');


const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	signingSecret: process.env.SLACK_SIGNING_SECRET,
	socketMode: true,
	appToken: process.env.SLACK_APP_TOKEN,
});

const bigquery = new BigQuery({
	projectId: PROJECT_ID,
	credentials: {
		client_email: CLIENT_EMAIL,
		private_key: PRIVATE_KEY,
	},
});

app.message("hello", async ({ message, say }) => {
	try {
		await say("Hey there");
	} catch (error) {
		console.log(error);
	}
});

function sendMessage(channel, message) {
	channel = "contact-channel"
	app.client.chat.postMessage({
		channel: channel,
		text: message,
	});
}
let documents

(async () => {
	// Start your app
	await app.start(process.env.PORT || 3000);
	console.log("⚡️ App is running!");
	try {
		// console.log('Fetched documents:', documents);
	  } catch (err) {
		console.error('Error fetching documents:', err);
	  }
})();

const date = new Date();
const yesterday = new Date(date.setDate(date.getDate() - 1));
const sevenDaysAgo = new Date(date.setDate(date.getDate() - 7));
const formattedDate = yesterday.toISOString().split("T")[0];
const sevenDaysAgoFormattedDate = sevenDaysAgo.toISOString().split("T")[0];

async function getDataNew(projectId, datasetId, tableId, startDate) {
	const query = `
		SELECT * from \`${projectId}.${datasetId}.${tableId}\`
		WHERE date > '${startDate}'
		LIMIT 1000
	`;

	const options = {
		query: query,
	};

	const [job] = await bigquery.createQueryJob(options);
	console.log(`Job ${job.id} started\n`);

	const rows = await job.getQueryResults();
	// console.log(rows);

	return rows[0];
}

async function getDataKeywordReport(projectId, datasetId, tableId, startDate) {
	const query = `
		SELECT * from \`${projectId}.${datasetId}.${tableId}\`
		WHERE to_date > CAST('${startDate}' AS DATE)
		LIMIT 1000
	`;

	const options = {
		query: query,
	};

	const [job] = await bigquery.createQueryJob(options);
	console.log(`Job ${job.id} started\n`);

	const rows = await job.getQueryResults();
	// console.log(rows);

	return rows[0];
}



const fetchDocs = async ()=> {
	documents = await fetchDocuments();
	documents.forEach(async element => {
		if (element.applyRuleTo === 'Campaign') {
			await sendCampaignInefficientNotification(element.conditions, formattedDate);
		}

		else if (element.applyRuleTo === 'AdGroup') {
			await sendHighCpcNotification(element.conditions, formattedDate);
		}

		else if (element.applyRuleTo === 'Targeting') {
			await sendLowConversionRateNotification(element.conditions, sevenDaysAgoFormattedDate);
		}

		else if (element.applyRuleTo === 'SearchTerm') {
			element.conditions.forEach(async metrics => {
				if(metrics?.metric === 'ACOS'){
					await sendLowAcosNotification(element.conditions, sevenDaysAgoFormattedDate);
				}
				else if (metrics?.metric === 'CTR') {
					await sendLowCtrNotification(element.conditions, formattedDate);
				}
			})
		}
	});
}
async function sendCampaignInefficientNotification(conditions, time_range) {
	try {
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			"PLA_Consolidated_Daily_Report",
			time_range
		);

		const inefficientCampaigns = [];
		// console.log(campaignData);

		for (data of campaignData) {
			// const { ad_spend, direct_revenue, indirect_revenue } = data;
			// const roas = (direct_revenue + indirect_revenue) / ad_spend;
			let ad_spend = 0;
			let ad_spend_condition = ''
			let roas = 0;
			let roas_condition = ''

			conditions.forEach(metrics => {
				if(metrics?.metric === 'Ad Spend'){
					ad_spend = metrics?.from_value
					ad_spend_condition = metrics.condition
				}
				else if(metrics?.metric === 'ROAS'){
					roas = metrics?.from_value
					roas_condition = metrics.condition
				}
			})
			if (ad_spend > 10000 && roas < 1) {
				// console.log("Campaign trigger");
				inefficientCampaigns.push(data.campaign_id);
			}
		}

		// console.log(inefficientCampaigns);

		if (inefficientCampaigns.length > 0) {
			const campaigns = inefficientCampaigns.join("\n");

			sendMessage(
				"campaign-inefficient",
				`Your following Campaigns are not efficient:\n\n ${campaigns}`
			);
		} else {
			sendMessage(
				"campaign-inefficient",
				`All your campaigns are running as expected!`
			);
		}
	} catch (error) {
		console.log(error);
	}
}

async function sendHighCpcNotification(conditions, time_range) {
	try {
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			"PLA_Consolidated_Daily_Report",
			time_range
		);

		const highCpcCampaigns = [];
		// console.log('CAMPobject', campaignData.length);
		for (data of campaignData) {
			// const { ad_spend, clicks } = data;
			// const cpc = ad_spend / clicks;

			let cpc = 0;

			conditions.forEach(metrics => {
				if(metrics?.metric === 'CPC'){
					cpc = metrics?.from_value
				}
			})
			if (cpc > 100) {
				// high cpc trigger
				highCpcCampaigns.push(data.adgroup_name);
			}
		}

		if (highCpcCampaigns.length > 0) {
			const campaigns = highCpcCampaigns.join("\n");

			sendMessage(
				"flipkart-high-cpc",
				`Your Cost per Click is getting expensive in the following ad groups:\n\n
					${campaigns}`
			);
		} else {
			sendMessage("flipkart-high-cpc", "Your campaigns are running as expected!");
		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowConversionRateNotification(conditions, time_range) {
	try {
		const campaignData = await getDataKeywordReport(
			"flipkart-390013",
			"relaxo",
			"PCA_Keyword_Report",
			time_range
		);

		const lowConversionRateCampaigns = [];
		// console.log('sendLowConversionRateNotification', campaignData.length);

		// ((direct units+indirect units)/clicks)*100

		for (data of campaignData) {
			// const { direct_converted_units, indirect_converted_units, clicks } = data;
			// const cr =
			// 	((direct_converted_units + indirect_converted_units) / clicks) * 100;

			let cr = 0;
			conditions.forEach(metrics => {
				if(metrics?.metric === 'CR'){
					cr = metrics?.from_value
				}
			})

			if (cr < 1) {
				// low conversion rate trigger
				lowConversionRateCampaigns.push(data.campaign_name);
			}
		}

		if (lowConversionRateCampaigns.length > 0) {
			const campaigns = lowConversionRateCampaigns.join("\n");

			sendMessage(
				"#flipkart-low-conversion-rate",
				`Your Conv Rate has dropped in the following targeting type:\n\n ${campaigns}`
			);
		} else {
			sendMessage("#flipkart-low-conversion-rate", "Your campaigns have good CR");
		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowCtrNotification(conditions, time_range) {
	try {
		const campaignData = await getDataKeywordReport(
			"flipkart-390013",
			"relaxo",
			"PLA_Search_Term_Report",
			time_range
		);

		const lowCtrCampaigns = [];
		// console.log('sendLowCtrNotification', campaignData.length);

		for (data of campaignData) {
			let ctr = 0;
			conditions.forEach(metrics => {
				if(metrics?.metric === 'CTR'){
					ctr = metrics?.from_value
				}
			})

			if (ctr < 10) {
				// low ctr trigger
				lowCtrCampaigns.push(data.query);
			}
		}

		// console.log(lowCtrCampaigns);

		if (lowCtrCampaigns.length > 0) {
			const campaigns = lowCtrCampaigns.join(",\n");

			sendMessage(
				"#flipkart-low-ctr",
				`Your CTR is dropping for the following search terms:\n\n ${campaigns}`
			);
		} else {
			sendMessage("#flipkart-low-ctr", "Your campaigns have good CTR");
		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowAcosNotification(conditions, time_range) {
	try {
		const campaignData = await getDataKeywordReport(
			"flipkart-390013",
			"relaxo",
			"PLA_Search_Term_Report",
			time_range
		);

		const lowAcosCampaigns = [];
		// console.log('sendLowAcosNotification', campaignData.length);

		for (data of campaignData) {

			let acos = 0;
			conditions.forEach(metrics => {
				if(metrics?.metric === 'ACOS'){
					acos = metrics?.from_value
				}
			})

			if (acos < 2) {
				// low acos trigger
				lowAcosCampaigns.push(data.query);
			}
		}

		// console.log(lowAcosCampaigns);

		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			sendMessage(
				"#flipkart-low-acos",
				`Insufficient Spends for the following search terms:\n\n ${campaigns}`
			);
		} else {
			sendMessage("#flipkart-low-acos", "Your campaigns have good ACoS");
		}
	} catch (error) {
		console.log(error);
	}
}

async function sendNotifications() {
	await fetchDocs();
	// await sendCampaignInefficientNotification();
	// await sendHighCpcNotification();
	// await sendLowConversionRateNotification();
	// await sendLowCtrNotification();
	// await sendLowAcosNotification();
}

sendNotifications();

cron.schedule(
	"* * * * *",
	async () => {
		console.log("cron job running");
		await sendNotifications();
	},
	{
		scheduled: true,
		timezone: "Asia/Kolkata",
	}
);
