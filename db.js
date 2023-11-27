async function sendCampaignInefficientNotification(conditions, time_range) {
	try {
		const campaignData = await getDataNew(
			"flipkart-390013",
			"relaxo",
			"PLA_Consolidated_Daily_Report",
			time_range
		);

		const inefficientCampaigns = [];

		for (data of campaignData) {
			let ad_spend = 0;
			let roas = 0;

			conditions.forEach(metrics => {
				if(metrics?.metric === 'Ad Spend'){
					ad_spend = metrics?.from_value
				}
				else if(metrics?.metric === 'ROAS'){
					roas = metrics?.from_value
				}
			})
			if (ad_spend > 10000 && roas < 1) {
				// console.log("Campaign trigger");
				inefficientCampaigns.push(data.campaign_id);
			}
		}

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
