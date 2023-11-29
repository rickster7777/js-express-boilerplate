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
	//channel = "contact-channel"
	app.client.chat.postMessage({
		channel: channel,
		text: message,
	});
}

const createChannel = async (ruleName) => {
	// const channelName = 'rule-name23';
	const channelName = ruleName;
	try {
		const result = await app.client.conversations.create({
			name: channelName,
		});

		console.log(`Channel created: ${result}`);
		return result.channel.name;
	} catch (error) {
		console.log('Cron job execution!!!');
	}
};


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


const dateTransform = (timeRange) => {
	const date = new Date();
	// let dateTrans
	if (timeRange === 'Yesterday') {
		const yesterday = new Date(date.setDate(date.getDate() - 1));
		const yesterdayDate = yesterday.toISOString().split("T")[0];
		return yesterdayDate;
	}

	else if (timeRange === 'Last 2 days') {
		const twoDaysAgo = new Date(date.setDate(date.getDate() - 2));
		const twoDaysAgoDate = twoDaysAgo.toISOString().split("T")[0];
		return twoDaysAgoDate
	}

	else if (timeRange === 'Last 3 days') {
		const threeDaysAgo = new Date(date.setDate(date.getDate() - 3));
		const threeDaysAgoDate = threeDaysAgo.toISOString().split("T")[0];
		return threeDaysAgoDate
	}
	else if (timeRange === 'Last 7 days') {
		const sevenDaysAgo = new Date(date.setDate(date.getDate() - 7));
		const sevenDaysAgoDate = sevenDaysAgo.toISOString().split("T")[0];
		return sevenDaysAgoDate
	}
	else if (timeRange === 'Last 14 days') {
		const fourteenDaysAgo = new Date(date.setDate(date.getDate() - 14));
		const fourteenDaysAgoDate = fourteenDaysAgo.toISOString().split("T")[0];
		return fourteenDaysAgoDate
	}
	else if (timeRange === 'Last 30 days') {
		const thirtyDaysAgo = new Date(date.setDate(date.getDate() - 30));
		const thirtyDaysAgoDate = thirtyDaysAgo.toISOString().split("T")[0];
		return thirtyDaysAgoDate
	}
}
const fetchDocs = async () => {
	documents = await fetchDocuments();
	documents.forEach(async element => {
		const timerange = dateTransform(element.timeRange);

		if (element.applyRuleTo === 'Campaign') {
			await sendCampaignInefficientNotification(element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'AdGroup') {
			await sendHighCpcNotification(element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'Targeting') {
			await sendLowConversionRateNotification(element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'SearchTerm') {
			element.conditions.forEach(async metrics => {
				if (metrics?.metric === 'ACOS') {
					await sendLowAcosNotification(element.ruleName, element.conditions, timerange);
				}
				else if (metrics?.metric === 'CTR') {
					await sendLowCtrNotification(element.ruleName, element.conditions, timerange);
				}
			})
		}
	});
}
async function sendCampaignInefficientNotification(ruleName, conditions, time_range) {
	try {
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			"PLA_Consolidated_Daily_Report",
			time_range
		);

		//console.log('camp length', campaignData.length);

		const inefficientCampaigns = [];
		// console.log(campaignData);

		function addToInefficientCampaigns(campaignId, campaignName) {
			let isAlreadyPresent = false;

			for (campaign of inefficientCampaigns) {
				if (campaign === campaignId+'-'+campaignName) {
					isAlreadyPresent = true;
					break;
				}
			}

			if (!isAlreadyPresent) {
				inefficientCampaigns.push(campaignId+'-'+campaignName);
			}
		}

		for (data of campaignData) {
			const { ad_spend, direct_revenue, indirect_revenue } = data;
			const roas = (direct_revenue + indirect_revenue) / ad_spend;

			const { clicks, views } = data;
			const ctr = (clicks / views) * 100;


			const cpc = ad_spend / clicks;
			const acos = (ad_spend / (direct_revenue + indirect_revenue)) * 100;

			const { direct_converted_units, indirect_converted_units } = data;
			const cr = ((direct_converted_units + indirect_converted_units) / clicks) * 100;


			conditions.forEach(metrics => {
				if (metrics?.metric === 'Ad Spend') {
					if (ad_spend) {
						if (metrics.condition === 'Is greater than') {
							if (ad_spend > metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (ad_spend < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (ad_spend > metrics.from_value && ad_spend < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(ad_spend > metrics.from_value && ad_spend < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}

				}
				if (metrics?.metric === 'ROAS') {
					if (roas) {
						if (metrics.condition === 'Is greater than') {
							if (roas > metrics.from_value) {

								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (roas < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (roas > metrics.from_value && roas < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(roas > metrics.from_value && roas < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}


				}

				if (metrics?.metric === 'CTR') {
					if (ctr) {
						if (metrics.condition === 'Is greater than') {
							if (ctr > metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (ctr < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (ctr > metrics.from_value && ctr < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(ctr > metrics.from_value && ctr < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}


				}

				if (metrics?.metric === 'CPC') {
					if (cpc) {
						if (metrics.condition === 'Is greater than') {
							if (cpc > metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (cpc < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (cpc > metrics.from_value && cpc < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(cpc > metrics.from_value && cpc < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}


				}

				if (metrics?.metric === 'ACOS') {
					if (acos) {
						if (metrics.condition === 'Is greater than') {
							if (acos > metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (acos < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (acos > metrics.from_value && acos < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(acos > metrics.from_value && acos < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'CR') {
					if (cr) {
						if (metrics.condition === 'Is greater than') {
							if (cr > metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (cr < metrics.from_value) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (cr > metrics.from_value && cr < metrics.to) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(cr > metrics.from_value && cr < metrics.to)) {
								addToInefficientCampaigns(data.campaign_id, data.campaign_name);
							}
						}
					}
				}
			})
		}

		// console.log(inefficientCampaigns);
		let newChannelname = await createChannel(ruleName);
		// let newChannelname = "contact-channel"
		//console.log('filter camp length', inefficientCampaigns.length);
		if (inefficientCampaigns.length > 0) {
			const campaigns = inefficientCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your following Campaigns are not efficient:\n\n ${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`All your campaigns are running as expected!`
				);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendHighCpcNotification(ruleName, conditions, time_range) {
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
				if (metrics?.metric === 'CPC') {
					cpc = metrics?.from_value
				}
			})
			if (cpc > 100) {
				// high cpc trigger
				highCpcCampaigns.push(data.adgroup_name);
			}
		}

		let newChannelname = await createChannel(ruleName);

		if (highCpcCampaigns.length > 0) {
			const campaigns = highCpcCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your Cost per Click is getting expensive in the following ad groups:\n\n
						${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(newChannelname, "Your campaigns are running as expected!");
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowConversionRateNotification(ruleName, conditions, time_range) {
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
				if (metrics?.metric === 'CR') {
					cr = metrics?.from_value
				}
			})

			if (cr < 1) {
				// low conversion rate trigger
				lowConversionRateCampaigns.push(data.campaign_name);
			}
		}

		let newChannelname = await createChannel(ruleName);
		if (lowConversionRateCampaigns.length > 0) {
			const campaigns = lowConversionRateCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your Conv Rate has dropped in the following targeting type:\n\n ${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(newChannelname, "Your campaigns have good CR");
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowCtrNotification(ruleName, conditions, time_range) {
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
				if (metrics?.metric === 'CTR') {
					ctr = metrics?.from_value
				}
			})

			if (ctr < 10) {
				// low ctr trigger
				lowCtrCampaigns.push(data.query);
			}
		}

		// console.log(lowCtrCampaigns);
		let newChannelname = await createChannel(ruleName);
		console.log(newChannelname);
		if (lowCtrCampaigns.length > 0) {
			const campaigns = lowCtrCampaigns.join(",\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your CTR is dropping for the following search terms:\n\n ${campaigns}`
				);
			}


		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, "Your campaigns have good CTR");
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowAcosNotification(ruleName, conditions, time_range) {
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
				if (metrics?.metric === 'ACOS') {
					acos = metrics?.from_value
				}
			})

			if (acos < 2) {
				// low acos trigger
				lowAcosCampaigns.push(data.query);
			}
		}

		// console.log(lowAcosCampaigns);
		let newChannelname = await createChannel(ruleName);
		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Insufficient Spends for the following search terms:\n\n ${campaigns}`
				);
			}

		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, "Your campaigns have good ACoS");
			}

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
