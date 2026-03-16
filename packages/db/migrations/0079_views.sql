-- Migration: 0079_views.sql
-- Generated from: 0000_version_1.sql
-- Table: views (Views)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

/*!50001 DROP VIEW IF EXISTS `v_pos_daily_totals`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_pos_daily_totals` AS SELECT
 1 AS `company_id`,
  1 AS `outlet_id`,
  1 AS `trx_date`,
  1 AS `status`,
  1 AS `tx_count`,
  1 AS `gross_total`,
  1 AS `paid_total` */;
SET character_set_client = @saved_cs_client;

-- Final view structure for view `v_pos_daily_totals`
--

/*!50001 DROP VIEW IF EXISTS `v_pos_daily_totals`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_pos_daily_totals` AS select `pt`.`company_id` AS `company_id`,`pt`.`outlet_id` AS `outlet_id`,cast(`pt`.`trx_at` as date) AS `trx_date`,`pt`.`status` AS `status`,count(0) AS `tx_count`,coalesce(sum(`i`.`gross_total`),0) AS `gross_total`,coalesce(sum(`p`.`paid_total`),0) AS `paid_total` from ((`pos_transactions` `pt` left join (select `pos_transaction_items`.`pos_transaction_id` AS `pos_transaction_id`,sum(`pos_transaction_items`.`qty` * `pos_transaction_items`.`price_snapshot`) AS `gross_total` from `pos_transaction_items` group by `pos_transaction_items`.`pos_transaction_id`) `i` on(`i`.`pos_transaction_id` = `pt`.`id`)) left join (select `pos_transaction_payments`.`pos_transaction_id` AS `pos_transaction_id`,sum(`pos_transaction_payments`.`amount`) AS `paid_total` from `pos_transaction_payments` group by `pos_transaction_payments`.`pos_transaction_id`) `p` on(`p`.`pos_transaction_id` = `pt`.`id`)) group by `pt`.`company_id`,`pt`.`outlet_id`,cast(`pt`.`trx_at` as date),`pt`.`status` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

