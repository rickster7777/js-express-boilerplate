const { App } = require("@slack/bolt");
const { BigQuery } = require("@google-cloud/bigquery");
const { PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY } = require("./constants");
const cron = require("node-cron");
const ActionCampMapping = require('./actionCamp');

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
})();


async function getDataNew(projectId, datasetId, tableId, startDate, applyRuleTo) {
	try {
		let query = ''
		let idparam = ''
		let idname = ''

		if (applyRuleTo === 'campaign') {
			idparam = 'campaign_id'
			idname = 'campaign_name'
		} else {
			idparam = 'ad_group_id'
			if (tableId === "PLA_Consolidated_Daily_Report") {
				idname = 'adgroup_name'
			} else {
				idname = 'ad_group_name'
			}

		}

		if (tableId === "PLA_Consolidated_Daily_Report") {
			query = `
		SELECT ${idparam}, ${idname}, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
		SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue,SUM(units_sold_direct) AS total_direct_units, SUM(units_sold_indirect) AS total_indirect_units
		FROM \`${projectId}.${datasetId}.${tableId}\`
		WHERE date > '${startDate}'
		GROUP BY ${idparam}, ${idname}
		LIMIT 1000
		`;
		} else {
			query = `
		SELECT ${idparam}, ${idname}, SUM(banner_group_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
		SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue, SUM(direct_units) AS total_direct_units, SUM(indirect_units) AS total_indirect_units
		FROM \`${projectId}.${datasetId}.${tableId}\`
		WHERE date > '${startDate}'
		GROUP BY ${idparam}, ${idname}
		LIMIT 1000
		`;
		}

		if (applyRuleTo !== 'campaign') {
			if (tableId === "PLA_Consolidated_Daily_Report") {
				query = `
			SELECT ${idparam}, ${idname}, campaign_id, campaign_name, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
			SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue,SUM(units_sold_direct) AS total_direct_units, SUM(units_sold_indirect) AS total_indirect_units
			FROM \`${projectId}.${datasetId}.${tableId}\`
			WHERE date > '${startDate}'
			GROUP BY ${idparam}, ${idname}, campaign_id, campaign_name
			LIMIT 1000
			`;
			} else {
				query = `
			SELECT ${idparam}, ${idname}, campaign_id, campaign_name, SUM(banner_group_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
			SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue, SUM(direct_units) AS total_direct_units, SUM(indirect_units) AS total_indirect_units
			FROM \`${projectId}.${datasetId}.${tableId}\`
			WHERE date > '${startDate}'
			GROUP BY ${idparam}, ${idname}, campaign_id, campaign_name
			LIMIT 1000
			`;
			}
		}

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

async function getDataKeywordReport(projectId, datasetId, tableId, startDate, applyRuleTo) {
	try {
		let query = ''

		if (applyRuleTo !== 'SearchTerm') {
			if (tableId === "PLA_Keyword_Report") {
				query = `
					SELECT campaign_id, campaign_name, adgroup_id, attributed_keyword, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
					SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue,SUM(direct_units_sold) AS total_direct_units, SUM(indirect_units_sold) AS total_indirect_units
					FROM \`${projectId}.${datasetId}.${tableId}\`
					WHERE from_date > '${startDate}'
					GROUP BY campaign_id, campaign_name, adgroup_id, attributed_keyword
					LIMIT 1000
					`;
			} else {
				query = `
					SELECT campaign_id, campaign_name, ad_group_id, ad_group_name, keyword, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
					SUM(total_revenue) AS total_direct_revenue, SUM(direct_converted_units) AS total_direct_units, SUM(indirect_converted_units) AS total_indirect_units
					FROM \`${projectId}.${datasetId}.${tableId}\`
					WHERE from_date > '${startDate}'
					GROUP BY campaign_id, campaign_name, ad_group_id, ad_group_name, keyword
					LIMIT 1000
					`;
			}
		}
		if (applyRuleTo === 'SearchTerm') {
			if (tableId === 'PLA_Search_Term_Report') {
				query = `
					SELECT campaign_id, campaign_name, adgroup_name, query, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
					SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue,SUM(direct_units_sold) AS total_direct_units, SUM(indirect_units_sold) AS total_indirect_units
					FROM \`${projectId}.${datasetId}.${tableId}\`
					WHERE from_date > '${startDate}'
					GROUP BY campaign_id, campaign_name, adgroup_name, query
					LIMIT 1000
					`;
			} else {
				query = `
					SELECT campaign_id, campaign_name, ad_group_id, ad_group_name, search_term, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
					SUM(total_revenue) AS total_direct_revenue, SUM(direct_converted_units) AS total_direct_units, SUM(indirect_converted_units) AS total_indirect_units
					FROM \`${projectId}.${datasetId}.${tableId}\`
					WHERE from_date > '${startDate}'
					GROUP BY campaign_id, campaign_name, ad_group_id, ad_group_name, search_term
					LIMIT 1000
					`;
			}
		}

		const options = {
			query: query,
		};

		const [job] = await bigquery.createQueryJob(options);
		console.log(`Job ${job.id} started\n`);

		const rows = await job.getQueryResults();
		// console.log(rows);

		return rows[0];
	} catch (error) {
		console.log('errobject', error);
	}
}

async function getDataFsnCreatives(projectId, datasetId, tableId, startDate, applyRuleTo) {
	try {
		let query = ''
		//tableId = "PLA_Placement_Performance_Report"
		if (tableId === "PLA_Consolidated_FSN_Report") {
			query = `
				SELECT campaign_id, campaign_name, ad_group_id, adgroup_name, fsn_id, product_name, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
				SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue,SUM(units_sold_direct) AS total_direct_units, SUM(units_sold_indirect) AS total_indirect_units
				FROM \`${projectId}.${datasetId}.${tableId}\`
				WHERE from_date > '${startDate}'
				GROUP BY campaign_id, campaign_name, ad_group_id, adgroup_name, fsn_id, product_name
				LIMIT 1000
				`;
		} else if (tableId === "PCA_Consolidated_Creative_Report") {
			query = `
				SELECT campaign_id, campaign_name, ad_group_id, ad_group_name, SUM(banner_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
				SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue, SUM(direct_units) AS total_direct_units, SUM(indirect_units) AS total_indirect_units
				FROM \`${projectId}.${datasetId}.${tableId}\`
				WHERE from_date > '${startDate}'
				GROUP BY campaign_id, campaign_name, ad_group_id, ad_group_name
				LIMIT 1000
				`;
		} else if (tableId === "PCA_Placement_Performance_Report") {
			query = `
				SELECT campaign_name, ad_group_name, placement, SUM(banner_group_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
				SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue, SUM(direct_units) AS total_direct_units, SUM(indirect_units) AS total_indirect_units
				FROM \`${projectId}.${datasetId}.${tableId}\`
				WHERE from_date > '${startDate}'
				GROUP BY campaign_name, ad_group_name, placement
				LIMIT 1000
				`;

		} else if (tableId === "PLA_Placement_Performance_Report") {
			query = `
				SELECT campaign_id, campaign_name, ad_group_id, adgroup_name, placement_type, SUM(ad_spend) AS total_ad_spend, SUM(clicks) AS total_clicks, SUM(views) AS total_views,
				SUM(direct_revenue) AS total_direct_revenue, SUM(indirect_revenue) AS total_indirect_revenue, SUM(units_sold_direct) AS total_direct_units, SUM(units_sold_indirect) AS total_indirect_units
				FROM \`${projectId}.${datasetId}.${tableId}\`
				WHERE from_date > '${startDate}'
				GROUP BY campaign_id, campaign_name, ad_group_id, adgroup_name, placement_type
				LIMIT 1000
				`;
		}

		const options = {
			query: query,
		};

		const [job] = await bigquery.createQueryJob(options);
		console.log(`Job ${job.id} started\n`);

		const rows = await job.getQueryResults();
		// console.log(rows);

		return rows[0];
	} catch (error) {
		console.log('errobject', error);
	}
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
		adsCateg = adsCateg?.adsCategory
		if (element.applyRuleTo === 'Campaign') {
			await sendCampaignInefficientNotification(adsCateg, element.action, element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'AdGroup') {
			await sendHighCpcNotification(adsCateg, element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'Targeting') {
			await sendLowConversionRateNotification(adsCateg, element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'SearchTerm') {
			await sendSearchTermNotification(adsCateg, element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'Asin/product_name') {
			await sendAsinNotification('PLA_Consolidated_FSN_Report', element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'Creatives') {
			await sendCreativesNotification('PCA_Consolidated_Creative_Report', element.ruleName, element.conditions, timerange);
		}

		else if (element.applyRuleTo === 'Placement Bid') {
			await sendPlacementNotification(adsCateg, element.ruleName, element.conditions, timerange);
		}
	});
}

const filteredRules = async (adsCateg, applyruleto, campaignData, conditions) => {

	const filteredCampaigns = []

	function addToInefficientCampaigns(metricId, metricTerm, adgroupid, adgroupname, campaignId, campaignName) {
		let isAlreadyPresent = false;
		let stringConcat = metricId + '-' + metricTerm + '-' + adgroupid + '-' + adgroupname + '-' + campaignId + '-' + campaignName;

		for (campaign of filteredCampaigns) {
			if (campaign === stringConcat) {
				isAlreadyPresent = true;
				break;
			}
		}

		if (!isAlreadyPresent) {
			stringConcat = stringConcat.replace(/^-+/, "");
			filteredCampaigns.push(stringConcat);
		}
	}
	let andOr = JSON.stringify(conditions)
	let parsedConditions = JSON.parse(andOr)

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
		let adgroupname = ''
		let adgroupId = ''
		let metricId = ''
		let metricTerm = ''

		if (applyruleto === 'Targeting') {
			if (adsCateg === 'PCA') {
				adgroupname = data.ad_group_name;
				adgroupId = data.ad_group_id;
				metricTerm = data.keyword
			} else {
				adgroupId = data.adgroup_id
				metricTerm = data.attributed_keyword
			}
		} else if (applyruleto === 'SearchTerm') {
			if (adsCateg === 'PCA') {

				adgroupname = data.ad_group_name ?? '';
				adgroupId = data.adgroup_id ?? '';
				metricTerm = data.search_term ?? '';
			} else {
				adgroupname = data.ad_group_name ?? '';
				metricTerm = data.query ?? '';
			}
		} else if (applyruleto === 'Asin/product_name') {
			adgroupId = data.ad_group_id ?? '';
			adgroupname = data.adgroup_name ?? '';
			metricTerm = daata.product_name ?? '';
			metricId = data.fsn_id ?? '';
		} else if (applyruleto === 'Placement') {
			if (adsCateg === 'PCA') {
				adgroupname = data.ad_group_name ?? '';
				metricTerm = data.placement ?? '';
			} else {
				adgroupId = data.ad_group_id ?? '';
				adgroupname = data.ad_group_name ?? '';
				metricTerm = data.placement_type ?? '';
			}
		} else if (applyruleto === 'Creatives') {
			adgroupId = data.ad_group_id ?? '';
			adgroupname = data.ad_group_name ?? '';
		}


		let { total_ad_spend, total_direct_revenue, total_indirect_revenue } = data;
		if (total_indirect_revenue === undefined) {
			total_indirect_revenue = 0
		}
		const roas = (total_direct_revenue + total_indirect_revenue) / total_ad_spend;

		const { total_clicks, total_views } = data;
		const ctr = (total_clicks / total_views) * 100;


		const cpc = total_ad_spend / total_clicks;
		const acos = (total_ad_spend / (total_direct_revenue + total_indirect_revenue)) * 100;

		const { total_direct_units, total_indirect_units } = data;
		const cr = ((total_direct_units + total_indirect_units) / total_clicks) * 100;

		const orders = total_direct_units + total_indirect_units;
		const revenue = total_direct_revenue + total_indirect_revenue;
		const cpa = (total_direct_units + total_indirect_units) / total_ad_spend;
		const impressions = total_views;


		let logicFlag = logics.includes("AND")
		if ((conditions.length > 1) || (logicFlag === false)) {
			conditions.forEach(metrics => {
				if (metrics?.metric === 'Ad Spend') {
					if (total_ad_spend) {
						if (metrics.condition === 'Is greater than') {
							if (total_ad_spend > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (total_ad_spend < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (total_ad_spend > metrics.from_value && total_ad_spend < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(total_ad_spend > metrics.from_value && total_ad_spend < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}

				}
				if (metrics?.metric === 'ROAS') {
					if (roas) {
						if (metrics.condition === 'Is greater than') {
							if (roas > metrics.from_value) {

								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (roas < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (roas > metrics.from_value && roas < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(roas > metrics.from_value && roas < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}

				}

				if (metrics?.metric === 'CTR') {
					if (ctr) {
						if (metrics.condition === 'Is greater than') {
							if (ctr > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (ctr < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (ctr > metrics.from_value && ctr < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(ctr > metrics.from_value && ctr < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}

				}

				if (metrics?.metric === 'CPC') {
					if (cpc) {
						if (metrics.condition === 'Is greater than') {
							if (cpc > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (cpc < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (cpc > metrics.from_value && cpc < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(cpc > metrics.from_value && cpc < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'ACOS') {
					if (acos) {
						if (metrics.condition === 'Is greater than') {
							if (acos > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (acos < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (acos > metrics.from_value && acos < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(acos > metrics.from_value && acos < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'CR') {
					if (cr) {
						if (metrics.condition === 'Is greater than') {
							if (cr > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (cr < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (cr > metrics.from_value && cr < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(cr > metrics.from_value && cr < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'Order') {
					if (orders) {
						if (metrics.condition === 'Is greater than') {
							if (orders > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (orders < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (orders > metrics.from_value && orders < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(orders > metrics.from_value && orders < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'Revenue') {
					if (revenue) {
						if (metrics.condition === 'Is greater than') {
							if (revenue > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (revenue < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (revenue > metrics.from_value && revenue < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(revenue > metrics.from_value && revenue < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'CPA') {
					if (cpa) {
						if (metrics.condition === 'Is greater than') {
							if (cpa > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (cpa < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (cpa > metrics.from_value && cpa < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(cpa > metrics.from_value && cpa < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}
					}
				}

				if (metrics?.metric === 'Impressions') {
					if (impressions) {
						if (metrics.condition === 'Is greater than') {
							if (impressions > metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is smaller than') {
							if (impressions < metrics.from_value) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is between') {
							if (impressions > metrics.from_value && impressions < metrics.to) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
							}
						}

						else if (metrics.condition === 'Is not between') {
							if (!(impressions > metrics.from_value && impressions < metrics.to)) {
								addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
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
										if ((total_ad_spend > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((total_ad_spend > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((total_ad_spend > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
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
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend < value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend < value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
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
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((total_ad_spend > value1 && total_ad_spend < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((total_ad_spend > value1 && total_ad_spend < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
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
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(total_ad_spend > value1 && total_ad_spend < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}
					else if (metric1 === 'ROAS') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((roas > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((roas > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas < value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas < value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1 || roas < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((roas > value1 && roas < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((roas > value1 && roas < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(roas > value1 && roas < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(roas > value1 && roas < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}
					else if (metric1 === 'CTR') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((ctr > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((ctr > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr < value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr < value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 || ctr < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((ctr > value1 && ctr < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((ctr > value1 && ctr < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(ctr > value1 && ctr < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(ctr > value1 && ctr < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}
					else if (metric1 === 'CPC') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cpc > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cpc > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc < value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc < value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 || cpc < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpc > value1 && cpc < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpc > value1 && cpc < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpc > value1 && cpc < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpc > value1 && cpc < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}
					else if (metric1 === 'ACOS') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((acos > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((acos > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos < value1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos < value1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1 || acos < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((acos > value1 && acos < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((acos > value1 && acos < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && (cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(acos > value1 && acos < to1) || !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(acos > value1 && acos < to1) && !(cr > value2 && cr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}
					else if (metric1 === 'CR') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cr > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cr > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1 || cr < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cr > value1 && cr < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cr > value1 && cr < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cr > value1 && cr < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cr > value1 && cr < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}

					else if (metric1 === 'Order') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((orders > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((orders > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders < value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders < value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 || orders < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((orders > value1 && orders < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((orders > value1 && orders < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(orders > value1 && orders < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(orders > value1 && orders < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}

					else if (metric1 === 'Revenue') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((revenue > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((revenue > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue < value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue < value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 || revenue < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((revenue > value1 && revenue < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((revenue > value1 && revenue < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(revenue > value1 && revenue < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(revenue > value1 && revenue < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}

					else if (metric1 === 'CPA') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cpa > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((cpa > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa < value1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa < value1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 || cpa < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((cpa > value1 && cpa < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((cpa > value1 && cpa < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Impressions') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (impressions > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (impressions < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && (impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(cpa > value1 && cpa < to1) || !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(cpa > value1 && cpa < to1) && !(impressions > value2 && impressions < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}
					}

					else if (metric1 === 'Impressions') {
						if (condition1 === 'Is greater than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((impressions > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
									else {
										if ((impressions > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

						}
						else if (condition1 === 'Is smaller than') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions < value1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions < value1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 || impressions < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if ((impressions > value1 && impressions < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if ((impressions > value1 && impressions < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}
						}

						else if (condition1 === 'Is not between') {
							if (metric2 === 'Ad Spend') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (total_ad_spend > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (total_ad_spend < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(total_ad_spend > value2 && total_ad_spend < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}

								}
							}

							else if (metric2 === 'ROAS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (roas > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (roas < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(roas > value2 && roas < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CTR') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (ctr > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (ctr < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(ctr > value2 && ctr < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPC') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpc > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpc < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(cpc > value2 && cpc < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'ACOS') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (acos > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (acos < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(acos > value2 && acos < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Order') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (orders > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (orders < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(orders > value2 && orders < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'Revenue') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (revenue > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (revenue < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(revenue > value2 && revenue < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
							}

							else if (metric2 === 'CPA') {
								if (condition2 === 'Is greater than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpa > value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is smaller than') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpa < value2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}

								else if (condition2 === 'Is between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && (cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									}
								}
								else if (condition2 === 'Is not between') {
									if (logicGate === 'OR') {
										if (!(impressions > value1 && impressions < to1) || !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
										}
									} else {
										if (!(impressions > value1 && impressions < to1) && !(cpa > value2 && cpa < to2)) {
											addToInefficientCampaigns(metricId, metricTerm, adgroupId, adgroupname, data.campaign_id, data.campaign_name);
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

	return filteredCampaigns
}
async function sendCampaignInefficientNotification(adsCateg, actions, ruleName, conditions, time_range) {
	try {
		let adcat = "PLA_Consolidated_Daily_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Consolidated_Daily_Report";
		}
		//console.log(adcat);
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range,
			'campaign'
		);

		// console.log('camp length', campaignData.length);

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

		const inefficientCampaigns = await filteredRules(adsCateg, 'Campaign', campaignData, conditions);

		await actionCampMap(actions, inefficientCampaigns)
		let newChannelname = await createChannel(ruleName);
		//let newChannelname = "contact-channel"

		if (inefficientCampaigns.length > 0) {
			const campaigns = inefficientCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname, `The following campaigns have the Potential to Scale ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`All your campaigns are running as expected! ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`
				);
			}

		}
	}
	catch (error) {
		console.log(error);
	}
}

const actionCampMap = async (actions, campaignsList) => {

	let actionCampaign = JSON.parse(JSON.stringify(actions));

	for (let c of campaignsList) {
		try {
			const now = new Date();
			const timestampString = now.toISOString();

			const actionCampaignMapping = {
				campaign_id: c.split('-')[0].trim(),
				action_name: actionCampaign.name,
				campaign_budget: actionCampaign.campaignBudget,
				isExecuted: false,
				createdAt: timestampString
			};

			const existingAction = await ActionCampMapping.findOne({
				campaign_id: actionCampaignMapping.campaign_id,
			});

			if (existingAction) {
				existingAction.action_name = actionCampaignMapping.action_name;
				existingAction.campaign_budget = actionCampaignMapping.campaign_budget;
				existingAction.createdAt = actionCampaignMapping.createdAt;
				await existingAction.save();
				//console.log('Updated existing action for campaign:', existingAction.campaign_id);
			} else {
				const newAction = new ActionCampMapping(actionCampaignMapping);
				await newAction.save();
				console.log('Saved new action for campaign:', newAction.campaign_id);
			}
		}
		catch (error) {
			console.error(error);
		}
	}

}

async function sendHighCpcNotification(adsCateg, ruleName, conditions, time_range) {
	try {
		let adcat = "PLA_Consolidated_Daily_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Consolidated_Daily_Report";
		}

		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range,
			'adgroup'
		);

		let andOr = JSON.stringify(conditions)
		let parsedConditions = JSON.parse(andOr)

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

		const highCpcCampaigns = await filteredRules(adsCateg, 'AdGroup', campaignData, conditions);
		let newChannelname = await createChannel(ruleName);
		// let newChannelname = "contact-channel"
		if (highCpcCampaigns.length > 0) {
			const campaigns = highCpcCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname, `Your following Ad Groups are not efficient ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your adgroups are running as expected ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendLowConversionRateNotification(adsCateg, ruleName, conditions, time_range) {
	try {
		let adcat = "PLA_Keyword_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Keyword_Report";
		}
		const campaignData = await getDataKeywordReport(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range,
			'Targeting'
		);

		const lowConversionRateCampaigns = await filteredRules(adsCateg, 'Targeting', campaignData, conditions)
		let newChannelname = await createChannel(ruleName);
		//let newChannelname = "contact-channel"
		if (lowConversionRateCampaigns.length > 0) {
			const campaigns = lowConversionRateCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your Conv Rate has dropped in the following targeting type ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {
			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your targeting have good metrics ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendSearchTermNotification(adsCateg, ruleName, conditions, time_range) {
	try {
		let adcat = "PLA_Search_Term_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Search_Term_Report";
		}
		const campaignData = await getDataKeywordReport(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range,
			'SearchTerm'
		);

		const lowAcosCampaigns = await filteredRules(adsCateg, 'SearchTerm', campaignData, conditions)
		let newChannelname = await createChannel(ruleName);
		// let newChannelname = "contact-channel"
		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your following search terms are not efficient ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your search terms have good metrics ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendAsinNotification(adsCateg, ruleName, conditions, time_range) {
	try {

		const campaignData = await getDataFsnCreatives(
			"flipkart-390013",
			"relaxo",
			"PLA_Consolidated_FSN_Report",
			time_range,
			'Asin/product_name'
		);

		const lowAcosCampaigns = await filteredRules(adsCateg, 'Asin/product_name', campaignData, conditions)
		let newChannelname = await createChannel(ruleName);
		// let newChannelname = "contact-channel"
		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your following FSNs are not efficient :${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your FSNs have good metrics ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendCreativesNotification(adsCateg, ruleName, conditions, time_range) {
	try {

		const campaignData = await getDataFsnCreatives(
			"flipkart-390013",
			"relaxo",
			"PCA_Consolidated_Creative_Report",
			time_range,
			'Creatives'
		);

		const lowAcosCampaigns = await filteredRules(adsCateg, 'Creatives', campaignData, conditions)
		let newChannelname = await createChannel(ruleName);
		//let newChannelname = "contact-channel"
		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your following creatives are not efficient ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your creatives have good metrics: ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendPlacementNotification(adsCateg, ruleName, conditions, time_range) {
	try {
		let adcat = "PLA_Placement_Performance_Report";

		if (adsCateg === 'PCA') {
			adcat = "PCA_Placement_Performance_Report";
		}
		const campaignData = await getDataFsnCreatives(
			"flipkart-390013",
			"relaxo",
			adcat,
			time_range,
			'Placement'
		);

		const lowAcosCampaigns = await filteredRules(adsCateg, 'Placement', campaignData, conditions)
		let newChannelname = await createChannel(ruleName);
		// let newChannelname = "contact-channel"
		if (lowAcosCampaigns.length > 0) {
			const campaigns = lowAcosCampaigns.join("\n");

			if (newChannelname !== undefined) {
				sendMessage(
					newChannelname,
					`Your following Placements are not efficient ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}\n\n${campaigns}`
				);
			}

		} else {

			if (newChannelname !== undefined) {
				sendMessage(newChannelname, `Your Placements have good metrics ${adsCateg}:\n where ${conditions[0]?.metric ?? ''} ${conditions[0]?.condition ?? ''} ${conditions[0]?.from_value ?? ''} ${conditions[0]?.to ?? ''} ${conditions[1]?.check ?? ''} ${conditions[2]?.metric ?? ''} ${conditions[2]?.condition ?? ''} ${conditions[2]?.from_value ?? ''} ${conditions[2]?.to ?? ''}`);
			}

		}
	} catch (error) {
		console.log(error);
	}
}

async function sendNotifications() {
	await fetchDocs();
}

sendNotifications();

cron.schedule(
	"*/5 * * * *",
	async () => {
		console.log("cron job running");
		await sendNotifications();
	},
	{
		scheduled: true,
		timezone: "Asia/Kolkata",
	}
);
