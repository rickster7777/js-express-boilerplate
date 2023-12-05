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
		console.log('CJ execution!!');
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
	try {
		const query = `
		SELECT campaign_id, campaign_name, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
		SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue
		FROM \`${projectId}.${datasetId}.${tableId}\`
		WHERE date > '${startDate}'
		GROUP BY campaign_id, campaign_name
		LIMIT 1000
		`;

		;
		const options = {
			query: query,
		};

		const [job] = await bigquery.createQueryJob(options);
		console.log(`Job ${job.id} started\n`);

		const rows = await job.getQueryResults();
		// console.log(rows);

		return rows[0];
	} catch (error) {
		console.log('getdatnew error', error)
	}

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

		let adsCateg = JSON.stringify(element);
		adsCateg = JSON.parse(adsCateg);
		adsCateg = adsCateg.adsCategory
		if (element.applyRuleTo === 'Campaign') {
			await sendCampaignInefficientNotification(adsCateg, element.action, element.ruleName, element.conditions, timerange);
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
async function sendCampaignInefficientNotification(adsCateg, actions, ruleName, conditions, time_range) {
	try {
		//const adcat = adsCateg === 'PCA' ? 'PCA_Consolidated_Daily_Report' : 'PLA_Consolidated_Daily_Report';
		let adcat = "PLA_Consolidated_Daily_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Consolidated_Daily_Report";
		}
		console.log(adcat);
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range
		);

		console.log('camp length', campaignData.length);

		const inefficientCampaigns = [];
		// console.log(campaignData);

		function addToInefficientCampaigns(campaignId, campaignName) {
			let isAlreadyPresent = false;

			for (campaign of inefficientCampaigns) {
				if (campaign === campaignId + '-' + campaignName) {
					isAlreadyPresent = true;
					break;
				}
			}

			if (!isAlreadyPresent) {
				inefficientCampaigns.push(campaignId + '-' + campaignName);
			}
		}

		let andOr = JSON.stringify(conditions)
		let parsedConditions = JSON.parse(andOr)
		//console.log('andOr', JSON.parse(andOr));
		let logics = []
		if (conditions.length > 1) {
			for (let j of parsedConditions) {
				const valueAndOr = j?.check
				if (valueAndOr !== undefined) {
					logics.push(valueAndOr);
				}
			}
		}
		if (logics.length > 0) {
			for (let checks = 0; checks < conditions.length; checks++) {
				if (checks % 2 !== 0) {
					Object.defineProperty(conditions[checks], 'check', {
						value: logics[checks - 1],
						writable: true,
						enumerable: true,
						configurable: true
					});
				}
			}
		}

		for (data of campaignData) {
			// if(data.campaign_id === 'XHHN8MDH5L6N'){
			// 	console.log('XHHN8MDH5L6N');
			// }
			const dataGroup = {
				'campaign_id': data.campaign_id,
				'adSpend': data.total_ad_spend,
				'directrevenue': data.total_direct_revenue,
				'indirectrevenue': data.total_indirect_revenue,
				'clicks': data?.total_clicks,
				'views': data.total_views
			}
			//console.log(dataGroup);
			//const { total_ad_spend, direct_revenue, indirect_revenue } = data;
			const { total_ad_spend, total_direct_revenue, total_indirect_revenue } = data;
			const roas = (total_direct_revenue + total_indirect_revenue) / total_ad_spend;

			const { total_clicks, total_views } = data;
			const ctr = (total_clicks / total_views) * 100;


			const cpc = total_ad_spend / total_clicks;
			const acos = (total_ad_spend / (total_direct_revenue + total_indirect_revenue)) * 100;

			const { total_direct_converted_units, total_indirect_converted_units } = data;
			const cr = ((total_direct_converted_units + total_indirect_converted_units) / total_clicks) * 100;

			//console.log('logic object', logics);
			//logics.push('OR', 'AND')

			let logicFlag = logics.includes("AND")

			if ((conditions.length === 1) || (logicFlag === false)) {
				conditions.forEach(metrics => {
					if (metrics?.metric === 'Ad Spend') {
						if (total_ad_spend) {
							if (metrics.condition === 'Is greater than') {
								if (total_ad_spend > metrics.from_value) {
									addToInefficientCampaigns(data.campaign_id, data.campaign_name);
								}
							}

							else if (metrics.condition === 'Is smaller than') {
								if (total_ad_spend < metrics.from_value) {
									addToInefficientCampaigns(data.campaign_id, data.campaign_name);
								}
							}

							else if (metrics.condition === 'Is between') {
								if (total_ad_spend > metrics.from_value && total_ad_spend < metrics.to) {
									addToInefficientCampaigns(data.campaign_id, data.campaign_name);
								}
							}

							else if (metrics.condition === 'Is not between') {
								if (!(total_ad_spend > metrics.from_value && total_ad_spend < metrics.to)) {
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
			else {
				for (let i = 0; i < conditions.length; i++) {
					if (i % 2 !== 0) {
						let logicGate = conditions[i].check;

						let metric1 = conditions[i - 1].metric;
						let condition1 = conditions[i - 1].condition;
						let value1 = conditions[i - 1].from_value;
						let to1 = conditions[i - 1].to;

						let metric2 = conditions[i + 1].metric;
						let condition2 = conditions[i + 1].condition;
						let value2 = conditions[i + 1].from_value;
						let to2 = conditions[i + 1].to;


						if (metric1 === 'Ad Spend') {
							if (condition1 === 'Is greater than') {
								if (metric2 === 'ROAS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > 0) || (roas > 0)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
										else {
											if ((total_ad_spend > 0) && (roas > 0)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
										else {
											if ((total_ad_spend > value1) && (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CTR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}
									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CPC') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'ACOS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}
									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}
								}

								else if (metric2 === 'CR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1) || !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1) && !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}
							}

							else if (condition1 === 'Is smaller than') {
								if (metric2 === 'ROAS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}
								}

								else if (metric2 === 'CTR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CPC') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'ACOS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend < value1) || !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend < value1) && !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}
							}

							else if (condition1 === 'Is between') {
								if (metric2 === 'ROAS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 || total_ad_spend < to1) || (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								if (metric2 === 'CTR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								if (metric2 === 'CPC') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								if (metric2 === 'ACOS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								if (metric2 === 'CR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if ((total_ad_spend > value1 && total_ad_spend < to1) || !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if ((total_ad_spend > value1 && total_ad_spend < to1) && !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}
							}

							else if (condition1 === 'Is not between') {
								if (metric2 === 'ROAS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(roas > value2 && roas < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}

									}
								}

								else if (metric2 === 'CTR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(ctr > value2 && ctr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CPC') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(cpc > value2 && cpc < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'ACOS') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(acos > value2 && acos < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}

								else if (metric2 === 'CR') {
									if (condition2 === 'Is greater than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is smaller than') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr < value2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}

									else if (condition2 === 'Is not between') {
										if (logicGate === 'OR') {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										} else {
											if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(cr > value2 && cr < to2)) {
												addToInefficientCampaigns(data.campaign_id, data.campaign_name);
											}
										}
									}
								}
							}
						}
					}
				}

			}
		}

		// console.log(inefficientCampaigns);
		//let newChannelname = await createChannel(ruleName);
		let newChannelname = "contact-channel"
		//console.log('filter camp length', inefficientCampaigns.length);
		if (inefficientCampaigns.length > 0) {
			const campaigns = inefficientCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`The following campaigns have the Potential to Scale ${adsCateg}:\n\n ${campaigns}`
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
	}
	catch (error) {
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
			// const { total_ad_spend, clicks } = data;
			// const cpc = total_ad_spend / clicks;

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
